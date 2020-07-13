import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BaseService } from '~shared/services';

import { StagesModule } from '../stages/stages.module';
import { TracksModule } from '../tracks/tracks.module';
import { UsersModule } from '../users/users.module';
import { Task } from './models/task.entity';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

const TaskModel = MongooseModule.forFeature([
  { name: Task.modelName, schema: Task.schema }
]);
const baseService = { provide: BaseService, useClass: TasksService };
@Module({
  imports: [TaskModel, StagesModule, TracksModule, UsersModule],
  providers: [TasksService, baseService],
  controllers: [TasksController],
  exports: [TaskModel, TasksService, baseService]
})
export class TasksModule { }