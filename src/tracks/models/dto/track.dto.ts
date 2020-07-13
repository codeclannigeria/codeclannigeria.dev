import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { IsAlphanumeric, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { columnSize } from '~shared/constants';
import { PagedListDto } from '~shared/models/dto';
import { BaseDto } from '~shared/models/dto/base.dto';

@Exclude()
export class TrackDto extends BaseDto {
  @MaxLength(columnSize.length32)
  @IsAlphanumeric()
  @Expose()
  title: string;
  @MaxLength(columnSize.length128)
  @Expose()
  @IsNotEmpty()
  description: string;
  @ApiProperty({ readOnly: true })
  @Expose()
  @IsOptional()
  readonly thumbnailUrl?: string;
}
export class PagedTrackOutputDto extends PagedListDto(TrackDto) { }