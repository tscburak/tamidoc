import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StackForm, StackFormSchema } from './schemas/stack-form.schema';
import {
  StackSubmission,
  StackSubmissionSchema,
} from './schemas/stack-submission.schema';
import { StackFormsController } from './stack-forms.controller';
import { PublicStackFormsController } from './public-stack-forms.controller';
import { StackFormsService } from './stack-forms.service';
import { TemplatesModule } from '../templates/templates.module';
import { PdfRenderModule } from '../pdf-render/pdf-render.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StackForm.name, schema: StackFormSchema },
      { name: StackSubmission.name, schema: StackSubmissionSchema },
    ]),
    TemplatesModule,
    PdfRenderModule,
  ],
  controllers: [StackFormsController, PublicStackFormsController],
  providers: [StackFormsService],
  exports: [StackFormsService],
})
export class StackFormsModule {}
