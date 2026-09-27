import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class ValidationPipe implements PipeTransform {
  private readonly logger = new Logger(ValidationPipe.name);

  async transform(value: unknown, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToInstance(metatype, value);
    const errors = await validate(object);

    if (errors.length > 0) {
      const messages = errors.flatMap((error) => {
        return Object.values(error.constraints || {});
      });

      this.logger.warn(`Validation failed: ${messages.join(', ')}`);
      throw new BadRequestException(messages);
    }

    return object;
  }

  private toValidate(metatype: Function): boolean {
    const types: Array<Function> = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}
