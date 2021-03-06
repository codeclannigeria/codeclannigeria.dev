import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe
} from '@nestjs/common';
import { ContextIdFactory } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import {
  getModelForClass,
  mongoose,
  ReturnModelType
} from '@typegoose/typegoose';
import * as fs from 'fs';
import * as request from 'supertest';
import { JwtAuthGuard } from '~/auth/guards';
import { JwtPayload } from '~/auth/models/jwt-payload';
import { JwtStrategy } from '~/auth/strategies/jwt.strategy';
import { Course } from '~/courses/models/course.entity';
import { MentorMentee } from '~/mentor/models/mentor-mentee.entity';
import { Stage } from '~/stages/models/stage.entity';
import { CreateSubmissionDto } from '~/tasks/models/dtos/create-subission.dto';
import { CreateTaskDto } from '~/tasks/models/dtos/create-task.dto';
import { SubmissionDto } from '~/tasks/models/dtos/submission.dto';
import { Task } from '~/tasks/models/task.entity';
import { TasksModule } from '~/tasks/tasks.module';
import { TasksService } from '~/tasks/tasks.service';
import { TrackMentor } from '~/tracks/models/track-mentor.entity';
import { Track } from '~/tracks/models/track.entity';
import { User, UserRole } from '~/users/models/user.entity';
import { MailService } from '~shared/mail/mail.service';

import { DbTest, inMemoryDb } from './helpers/db-test.module';

describe('TasksController (e2e)', () => {
  let app: INestApplication;
  let route: request.SuperTest<request.Test>;
  let service: TasksService;
  let mongo: typeof mongoose;
  const validEmail = 'email@gmail.com';
  const validPass = 'pass@45Pdd';
  let currentUser: JwtPayload;
  let track: Track;
  let TaskModel: ReturnModelType<typeof Task>;
  let UserModel: ReturnModelType<typeof User>;
  let TrackModel: ReturnModelType<typeof Track>;
  let StageModel: ReturnModelType<typeof Stage>;
  let TrackMentorModel: ReturnModelType<typeof TrackMentor>;
  let MentorMenteeModel: ReturnModelType<typeof MentorMentee>;

  let CourseModel: ReturnModelType<typeof Course>;

  const jwtGuard = {
    canActivate: (context: ExecutionContext): boolean => {
      const req = context.switchToHttp().getRequest();
      req.user = currentUser;
      throw new UnauthorizedException();
    }
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [TasksModule, DbTest],
      providers: [JwtStrategy]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtGuard)
      .overrideProvider(MailService)
      .useValue({ sendMailAsync: () => Promise.resolve() })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidUnknownValues: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true
        }
      })
    );

    await app.init();
    const contextId = ContextIdFactory.getByRequest(request);
    service = await module.resolve<TasksService>(TasksService, contextId);

    const { uri } = await inMemoryDb.runningInstance;
    mongoose.Promise = Promise;
    mongo = await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
      useFindAndModify: false
    });
    TaskModel = getModelForClass(Task, { existingMongoose: mongo });
    StageModel = getModelForClass(Stage, { existingMongoose: mongo });
    TrackModel = getModelForClass(Track, { existingMongoose: mongo });
    CourseModel = getModelForClass(Course, { existingMongoose: mongo });
    TrackMentorModel = getModelForClass(TrackMentor, {
      existingMongoose: mongo
    });
    MentorMenteeModel = getModelForClass(MentorMentee, {
      existingMongoose: mongo
    });
    UserModel = getModelForClass(User, { existingMongoose: mongo });

    const user = await UserModel.create({
      email: validEmail,
      firstName: 'firstName',
      lastName: 'lastName',
      password: validPass
    });

    currentUser = {
      email: user.email,
      userId: user.id,
      role: user.role
    };
    route = request(app.getHttpServer());
  });

  describe('/tasks (POST)', () => {
    const input: CreateTaskDto = {
      title: 'Task1',
      description: 'Description',
      stage: '',
      track: '',
      course: ''
    };
    it('should return 401 if user not logged in', async () => {
      return route.post('/tasks').send(input).expect(401);
    });
    it('should return 403 if user role is neither ADMIN nor MENTOR', async () => {
      jest
        .spyOn(jwtGuard, 'canActivate')
        .mockImplementation((context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = currentUser;
          return true;
        });
      return route.post('/tasks').send(input).expect(403);
    });
    let task: Task;
    it('should return 201 if user role is permitted', async () => {
      track = await TrackModel.create({
        title: 'title',
        description: 'description'
      });
      const newStage = await StageModel.create({
        title: 'title',
        description: 'description',
        track: track.id,
        level: 0
      });
      const newCourse = await CourseModel.create({
        title: 'title',
        description: 'description',
        playlistUrl: 'www.google.com',
        enrollmentCount: 0
      });
      input.stage = newStage.id;
      input.track = track.id;
      input.course = newCourse.id;

      currentUser.role = UserRole.ADMIN;
      const { body } = await route.post('/tasks').send(input).expect(201);
      task = await service.findById(body.id);
      expect(task.createdBy.toString()).toBe(currentUser.userId);
    });
    it('should return 409 for existing task title', async () => {
      return route.post('/tasks').send(input).expect(409);
    });
    it('should return 200 when task is updated', async () => {
      const newTitle = 'NEW_TITLE';
      const { body } = await route
        .put(`/tasks/${task.id}`)
        .send({ ...input, title: newTitle })
        .expect(200);

      const { updatedBy } = await service.findById(body.id);
      expect(body.title).toBe(newTitle);
      expect(updatedBy.toString()).toBe(currentUser.userId);
    });
    it('should return 403 for non-permitted user trying to UPDATE track', async () => {
      currentUser.role = UserRole.MENTEE;
      return route.put(`/tasks/${task.id}`).send(input).expect(403);
    });
    it('should return 403 for non-permitted user trying to DELETE track', async () => {
      return route.delete(`/tasks/${task.id}`).send(input).expect(403);
    });

    describe('/submission', () => {
      let submissionDto: SubmissionDto;
      it('should submit task', async () => {
        const promise = fs.promises;
        jest.spyOn(promise, 'readFile').mockResolvedValue('');

        const mentor = await UserModel.create({
          email: 'mentor' + validEmail,
          firstName: 'Mentor',
          lastName: 'Mentor',
          password: validPass,
          role: UserRole.MENTOR
        });
        currentUser.role = UserRole.MENTEE;

        await MentorMenteeModel.create({
          mentor: mentor.id,
          mentee: currentUser.userId,
          track: track
        });
        await TrackMentorModel.create({ mentor: mentor.id, track: track });
        const dto: CreateSubmissionDto = {
          menteeComment: 'comment',
          taskUrl: 'www.google.com'
        };
        const { body } = await route
          .post(`/tasks/${task.id}/submissions`)
          .send(dto)
          .expect(201);
        const dbTask = await TaskModel.findById(task.id);

        expect(dbTask.updatedBy.toString()).toBe(currentUser.userId);
        expect(body.id).toBeDefined();

        submissionDto = body;
      });
      it('should update already submitted task', async () => {
        const updatedComment = 'updated_comment';
        const dto: CreateSubmissionDto = {
          menteeComment: updatedComment,
          taskUrl: 'www.google.com'
        };

        const { body } = await route
          .post(`/tasks/${task.id}/submissions`)
          .send(dto)
          .expect(201);

        const dbTask = await TaskModel.findById(task.id);

        expect(dbTask.updatedBy.toString()).toBe(currentUser.userId);
        expect(body.menteeComment).toBe(updatedComment);

        submissionDto = body;
      });
      it('should get task submissions', async () => {
        const { body } = await route
          .get(`/tasks/${task.id}/submissions`)
          .expect(200);
        const { items } = body;

        expect(items.length).toBeGreaterThan(0);
        expect(items).toContainEqual(submissionDto);
      });
    });

    it('should soft delete track', async () => {
      currentUser.role = UserRole.ADMIN;
      await route.delete(`/tasks/${task.id}`).send(input).expect(200);

      const { deletedBy, isDeleted } = await TaskModel.findById(task.id);
      const res = await service.findById(task.id);

      expect(deletedBy.toString()).toBe(currentUser.userId);
      expect(isDeleted).toBe(true);
      expect(res).toBeFalsy();
    });
  });

  afterAll(async () => {
    const { collections } = mongoose.connection;
    Object.keys(collections).forEach(
      async (k) => await collections[`${k}`].deleteMany({})
    );

    // await mongo.disconnect();
    // await inMemoryDb.stop();
    await app.close();
  });
});
