import { Module } from '@nestjs/common';
import {
  PublicVerificationQueriesController,
  StaffMessagesController,
  StaffNotificationsController,
  StaffVerificationQueriesController,
  StudentMessagesController,
  StudentNotificationsController,
  StudentVerificationQueriesController,
} from './communication.controllers.js';
import { MessagesService } from './messages.service.js';
import { NotificationsService } from './notifications.service.js';
import { VerificationQueriesService } from './verification-queries.service.js';

/** Chat & Communication: student messages, verification queries and in-app notifications. */
@Module({
  controllers: [
    StudentMessagesController,
    StaffMessagesController,
    StudentNotificationsController,
    StaffNotificationsController,
    StudentVerificationQueriesController,
    PublicVerificationQueriesController,
    StaffVerificationQueriesController,
  ],
  providers: [MessagesService, NotificationsService, VerificationQueriesService],
  exports: [NotificationsService],
})
export class CommunicationModule {}
