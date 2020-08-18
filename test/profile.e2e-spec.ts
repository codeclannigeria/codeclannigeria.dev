import {
    ExecutionContext,
    HttpStatus,
    INestApplication,
    UnsupportedMediaTypeException,
    ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelForClass, mongoose, ReturnModelType } from '@typegoose/typegoose';
import * as request from 'supertest';
import * as uploader from '~shared/utils/upload-img.util';

import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { JwtPayload } from '../src/auth/models/jwt-payload';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { UpdateProfileDto } from '../src/profile/dto/update-profile.dto';
import { ProfileModule } from '../src/profile/profile.module';
import { Gender, User } from '../src/users/models/user.entity';
import { DbTest, inMemoryDb } from './helpers/db-test.module';

describe('ProfileController (e2e)', () => {
    let app: INestApplication;
    let route: request.SuperTest<request.Test>;
    let currentUser: JwtPayload;
    let mongo: typeof mongoose;
    let UserModel: ReturnModelType<typeof User>

    const validEmail = 'email@gmail.com';
    const validPass = 'pass@45Pdd';

    const jwtGuard = {
        canActivate: (context: ExecutionContext): boolean => {
            const req = context.switchToHttp().getRequest();
            req.user = currentUser;
            return true;
        }
    };

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [ProfileModule, DbTest],
            providers: [JwtStrategy]
        })
            .overrideGuard(JwtAuthGuard)
            .useValue(jwtGuard)
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

        const { uri } = await inMemoryDb.runningInstance;
        mongoose.Promise = Promise;
        mongo = await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            useCreateIndex: true,
            useFindAndModify: false
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
    })

    it('should get current user', async () => {
        const { body } = await route.get('/profile').expect(200);
        expect(currentUser.userId).toBe(body.id);
    });

    it('should update current user detail', async () => {
        await UserModel.updateOne({ _id: currentUser.userId }, { createdBy: currentUser.userId } as any);
        const input: UpdateProfileDto = {
            firstName: "NewFirstName",
            lastName: "NewLastName",
            phoneNumber: "+2348074455596",
            technologies: [".NET", "NodeJs"],
            description: "description",
            city: "Lagos",
            dob: new Date(2000, 1, 1),
            country: 'Nigeria',
            gender: Gender.FEMALE
        }
        await route.put('/profile').send(input).expect(200);

        const user = await UserModel.findById(currentUser.userId);
        expect(user.phoneNumber).toBe(input.phoneNumber)
        expect(user.firstName).toBe(input.firstName)
    });

    describe('File Upload', () => {
        it(`should return ${UnsupportedMediaTypeException.name} for non-image files`, async () => {
            return route.post('/profile/upload_profile_photo')
                .set('Content-Type', 'multipart/form-data')
                .attach('file', './docs/coverage.html').expect(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
        });
        it('should upload avatar', async () => {
            const mockPhotoUrl = "https://www.securePhtotUrl.com";
            jest.spyOn(uploader, 'uploadFileToCloud').mockResolvedValue(mockPhotoUrl)

            const { body } = await route.post('/profile/upload_profile_photo')
                .set('Content-Type', 'multipart/form-data')
                .attach('file', './docs/images/compodoc-vectorise.png').expect(HttpStatus.OK);

            expect(body.photoUrl).toBe(mockPhotoUrl);
        });

    });
    afterAll(async () => {
        const { collections } = mongoose.connection;

        Object.keys(collections).forEach(
            async (k) => collections[`${k}`].deleteMany({})
        );

        await mongo.disconnect();
        await inMemoryDb.stop();
        await app.close();
    });
});
