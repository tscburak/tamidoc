import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Form, FormSchema } from './schemas/form.schema';
import { Submission, SubmissionSchema } from './schemas/submission.schema';
import { FormsController } from './forms.controller';
import { PublicFormsController } from './public-forms.controller';
import { FormsService } from './forms.service';
import { TemplatesModule } from '../templates/templates.module';
import { PdfRenderModule } from '../pdf-render/pdf-render.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Form.name, schema: FormSchema },
      { name: Submission.name, schema: SubmissionSchema },
    ]),
    TemplatesModule,
    PdfRenderModule,
  ],
  controllers: [FormsController, PublicFormsController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}
