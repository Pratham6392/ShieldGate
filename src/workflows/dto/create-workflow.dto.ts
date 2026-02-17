import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkflowDto {
  @ApiProperty({ enum: ['enter', 'exit', 'manage'] })
  @IsIn(['enter', 'exit', 'manage'])
  intent!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  yieldId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({ type: Object })
  @IsObject()
  arguments!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  action?: string;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  passthrough?: Record<string, unknown>;
}
