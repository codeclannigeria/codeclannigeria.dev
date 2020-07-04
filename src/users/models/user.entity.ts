import { InternalServerErrorException } from '@nestjs/common';
import {
  getModelForClass,
  index,
  pre,
  prop,
  Ref,
  ReturnModelType
} from '@typegoose/typegoose';
import { hash } from 'bcrypt';
import { Exclude } from 'class-transformer';
import * as crypto from 'crypto';
import { Writable } from '~shared/types/abstract.type';

import { columnSize } from '../../shared/constants';
import { BaseEntity } from '../../shared/models/base.entity';
import { Task } from '../../tasks/models/task.entity';

export enum UserRole {
  MENTEE = 'MENTEE',
  MENTOR = 'MENTOR',
  ADMIN = 'ADMIN'
}

@pre<User>('save', async function () {
  try {
    (this as Writable<User>).password = await hash(this.password, 10);
  } catch (e) {
    throw new InternalServerErrorException(e);
  }
})
@index({ email: 1 }, { unique: true })
export class User extends BaseEntity {
  @prop({
    required: true,
    maxlength: columnSize.length64,
    trim: true,
    text: true,
  })
  readonly firstName!: string;
  @prop({
    required: true,
    maxlength: columnSize.length64,
    trim: true,
    text: true,
  })
  readonly lastName!: string;
  @prop({
    required: true,
    maxlength: columnSize.length64,
    trim: true,
    lowercase: true,
    text: true,
    unique: false
  })
  readonly email!: string;
  @prop({
    maxlength: columnSize.length64,
    trim: true,
    text: true,
    default: null
  })
  readonly phoneNumber!: string;
  @prop({
    default: null
  })
  readonly photoUrl: string = null;
  @prop({
    maxlength: columnSize.length128,
    trim: true,
    text: true,
    default: null
  })
  readonly description!: string;
  @prop({ items: String, default: [] })
  readonly technologies: string[] = [];
  @prop({ required: true, maxlength: columnSize.length64 })
  @Exclude()
  readonly password!: string;
  @Exclude()
  @prop({
    default: 0
  })
  readonly loginAttemptCount!: number;
  @prop({
    enum: UserRole,
    type: String,
    required: true,
    default: UserRole.MENTEE
  })
  readonly role = UserRole.MENTEE;

  @prop({ required: true, default: false })
  readonly isEmailVerified: boolean;
  @prop({ default: undefined })
  readonly lockOutEndDate?: Date;
  @prop({ required: true, default: 0 })
  readonly failedSignInAttempts!: number;
  @prop({ ref: 'Task', required: true })
  readonly tasks!: Ref<Task>[];
  /**
   * Get User's full name
   *
   * @readonly
   * @memberof User
   */
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
  setRandomPass(): void {
    (this as Writable<User>).password = crypto
      .randomBytes(columnSize.length32)
      .toString();
  }
  confirmEmail(): void {
    (this as Writable<User>).isEmailVerified = true;
  }

  static get model(): ReturnModelType<typeof User> {
    return getModelForClass(this);
  }
}
