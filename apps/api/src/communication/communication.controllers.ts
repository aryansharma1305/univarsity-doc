import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import {
  createMessageThreadSchema,
  messageReplySchema,
  messageThreadDetailSchema,
  messageThreadListSchema,
  messageThreadQuerySchema,
  notificationListSchema,
  notificationQuerySchema,
  notificationSchema,
  publicVerificationQueryReceiptSchema,
  publicVerificationQuerySchema,
  publicVerificationQueryStatusRequestSchema,
  requesterVerificationQueryListSchema,
  requesterVerificationQuerySchema,
  resolveVerificationQuerySchema,
  respondVerificationQuerySchema,
  staffVerificationQueryListSchema,
  staffVerificationQuerySchema,
  studentVerificationQuerySchema,
  unreadCountSchema,
  verificationQueryListQuerySchema,
  type CreateMessageThread,
  type MessageReply,
  type MessageThreadQuery,
  type NotificationQuery,
  type PublicVerificationQueryInput,
  type PublicVerificationQueryStatusRequest,
  type ResolveVerificationQuery,
  type RespondVerificationQuery,
  type StudentVerificationQueryInput,
  type VerificationQueryListQuery,
} from '@docversity/validation';
import type { Request, Response } from 'express';
import {
  type AuthContext,
  CsrfPreAuth,
  CurrentAuth,
  Public,
  RequirePermissions,
} from '../auth/auth.decorators.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  CurrentStudent,
  type StudentContext,
  StudentRoute,
} from '../student-auth/student-auth.decorators.js';
import { MessagesService } from './messages.service.js';
import { NotificationsService } from './notifications.service.js';
import { VerificationQueriesService } from './verification-queries.service.js';

const noStore = (res: Response) => res.setHeader('Cache-Control', 'no-store');

/** The signed-in student's conversations with the administration (student from the session). */
@ApiTags('student')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student/messages')
export class StudentMessagesController {
  constructor(private readonly service: MessagesService) {}

  @Get()
  @ApiOkResponse({ standardSchema: messageThreadListSchema })
  list(
    @CurrentStudent() student: StudentContext,
    @Query(new ZodValidationPipe(messageThreadQuerySchema)) query: MessageThreadQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return this.service.list(query, 'student', student.studentId);
  }

  @Post()
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Start a conversation with the administration' })
  @ApiBody({ schema: openApiRequestSchema(createMessageThreadSchema) })
  @ApiOkResponse({ standardSchema: messageThreadDetailSchema })
  create(
    @CurrentStudent() student: StudentContext,
    @Body(new ZodValidationPipe(createMessageThreadSchema)) body: CreateMessageThread,
  ) {
    return this.service.create(student.studentId, student.accountId, body);
  }

  @Get(':id')
  @ApiOkResponse({ standardSchema: messageThreadDetailSchema })
  detail(
    @CurrentStudent() student: StudentContext,
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return this.service.detail(id, 'student', student.studentId);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('csrf')
  @ApiOkResponse({ standardSchema: messageThreadDetailSchema })
  read(@CurrentStudent() student: StudentContext, @Param('id', UuidParamPipe) id: string) {
    return this.service.markRead(id, 'student', student.studentId);
  }

  @Post(':id/replies')
  @ApiSecurity('csrf')
  @ApiBody({ schema: openApiRequestSchema(messageReplySchema) })
  @ApiOkResponse({ standardSchema: messageThreadDetailSchema })
  reply(
    @CurrentStudent() student: StudentContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(messageReplySchema)) body: MessageReply,
  ) {
    return this.service.reply(id, body, {
      studentId: student.studentId,
      accountId: student.accountId,
    });
  }
}

/** Staff inbox for student conversations. */
@ApiTags('messages')
@ApiCookieAuth('session')
@Controller('messages')
export class StaffMessagesController {
  constructor(private readonly service: MessagesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.studentMessagesRead)
  @ApiOkResponse({ standardSchema: messageThreadListSchema })
  list(
    @Query(new ZodValidationPipe(messageThreadQuerySchema)) query: MessageThreadQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return this.service.list(query, 'staff');
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.studentMessagesRead)
  @ApiOkResponse({ standardSchema: messageThreadDetailSchema })
  detail(@Param('id', UuidParamPipe) id: string, @Res({ passthrough: true }) res: Response) {
    noStore(res);
    return this.service.detail(id, 'staff');
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.studentMessagesRead)
  @ApiOkResponse({ standardSchema: messageThreadDetailSchema })
  read(@Param('id', UuidParamPipe) id: string) {
    return this.service.markRead(id, 'staff');
  }

  @Post(':id/replies')
  @RequirePermissions(PERMISSIONS.studentMessagesRead, PERMISSIONS.studentMessagesRespond)
  @ApiBody({ schema: openApiRequestSchema(messageReplySchema) })
  @ApiOkResponse({ standardSchema: messageThreadDetailSchema })
  reply(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(messageReplySchema)) body: MessageReply,
  ) {
    return this.service.reply(id, body, { userId: auth.user.id });
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.studentMessagesRead, PERMISSIONS.studentMessagesRespond)
  @ApiOkResponse({ standardSchema: messageThreadDetailSchema })
  resolve(@CurrentAuth() auth: AuthContext, @Param('id', UuidParamPipe) id: string) {
    return this.service.setStatus(id, 'RESOLVED', auth.user.id);
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.studentMessagesRead, PERMISSIONS.studentMessagesRespond)
  @ApiOkResponse({ standardSchema: messageThreadDetailSchema })
  reopen(@CurrentAuth() auth: AuthContext, @Param('id', UuidParamPipe) id: string) {
    return this.service.setStatus(id, 'OPEN', auth.user.id);
  }
}

/** The signed-in student's own notifications. */
@ApiTags('student')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student/notifications')
export class StudentNotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOkResponse({ standardSchema: notificationListSchema })
  list(
    @CurrentStudent() student: StudentContext,
    @Query(new ZodValidationPipe(notificationQuerySchema)) query: NotificationQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return this.service.list({ studentId: student.studentId }, query);
  }

  @Get('unread-count')
  @ApiOkResponse({ standardSchema: unreadCountSchema })
  unread(@CurrentStudent() student: StudentContext, @Res({ passthrough: true }) res: Response) {
    noStore(res);
    return this.service.unread({ studentId: student.studentId });
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('csrf')
  @ApiOkResponse({ standardSchema: unreadCountSchema })
  readAll(@CurrentStudent() student: StudentContext) {
    return this.service.markAllRead({ studentId: student.studentId });
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('csrf')
  @ApiOkResponse({ standardSchema: notificationSchema })
  read(@CurrentStudent() student: StudentContext, @Param('id', UuidParamPipe) id: string) {
    return this.service.markRead({ studentId: student.studentId }, id);
  }
}

/** Any signed-in staff user's own notifications (no permission: only their own rows). */
@ApiTags('notifications')
@ApiCookieAuth('session')
@Controller('notifications')
export class StaffNotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOkResponse({ standardSchema: notificationListSchema })
  list(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(notificationQuerySchema)) query: NotificationQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return this.service.list({ userId: auth.user.id }, query);
  }

  @Get('unread-count')
  @ApiOkResponse({ standardSchema: unreadCountSchema })
  unread(@CurrentAuth() auth: AuthContext, @Res({ passthrough: true }) res: Response) {
    noStore(res);
    return this.service.unread({ userId: auth.user.id });
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ standardSchema: unreadCountSchema })
  readAll(@CurrentAuth() auth: AuthContext) {
    return this.service.markAllRead({ userId: auth.user.id });
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ standardSchema: notificationSchema })
  read(@CurrentAuth() auth: AuthContext, @Param('id', UuidParamPipe) id: string) {
    return this.service.markRead({ userId: auth.user.id }, id);
  }
}

/** The signed-in student's own verification queries. */
@ApiTags('student')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student/verification-queries')
export class StudentVerificationQueriesController {
  constructor(private readonly service: VerificationQueriesService) {}

  @Get()
  @ApiOkResponse({ standardSchema: requesterVerificationQueryListSchema })
  list(@CurrentStudent() student: StudentContext, @Res({ passthrough: true }) res: Response) {
    noStore(res);
    return this.service.listOwn(student.studentId);
  }

  @Post()
  @ApiSecurity('csrf')
  @ApiBody({ schema: openApiRequestSchema(studentVerificationQuerySchema) })
  @ApiOkResponse({ standardSchema: requesterVerificationQuerySchema })
  submit(
    @CurrentStudent() student: StudentContext,
    @Body(new ZodValidationPipe(studentVerificationQuerySchema))
    body: StudentVerificationQueryInput,
  ) {
    return this.service.submitAsStudent(student.studentId, student.accountId, body);
  }
}

/** Public verification support: submit a query, then check it with reference + access code. */
@ApiTags('public-verification')
@Public()
@CsrfPreAuth()
@Controller('public/verification-queries')
export class PublicVerificationQueriesController {
  constructor(private readonly service: VerificationQueriesService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a verification support query (access code shown once)' })
  @ApiBody({ schema: openApiRequestSchema(publicVerificationQuerySchema) })
  @ApiOkResponse({ standardSchema: publicVerificationQueryReceiptSchema })
  submit(
    @Body(new ZodValidationPipe(publicVerificationQuerySchema)) body: PublicVerificationQueryInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return this.service.submitPublic(body, req.ip ?? 'unknown');
  }

  @Post('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'A public query and its answer, for the reference + access code holder',
  })
  @ApiBody({ schema: openApiRequestSchema(publicVerificationQueryStatusRequestSchema) })
  @ApiOkResponse({ standardSchema: requesterVerificationQuerySchema })
  status(
    @Body(new ZodValidationPipe(publicVerificationQueryStatusRequestSchema))
    body: PublicVerificationQueryStatusRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return this.service.publicStatus(body, req.ip ?? 'unknown');
  }
}

/** Staff review of verification support queries. */
@ApiTags('verification-queries')
@ApiCookieAuth('session')
@Controller('verification-queries')
export class StaffVerificationQueriesController {
  constructor(private readonly service: VerificationQueriesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.verificationQueriesRead)
  @ApiOkResponse({ standardSchema: staffVerificationQueryListSchema })
  list(
    @Query(new ZodValidationPipe(verificationQueryListQuerySchema))
    query: VerificationQueryListQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.verificationQueriesRead)
  @ApiOkResponse({ standardSchema: staffVerificationQuerySchema })
  detail(@Param('id', UuidParamPipe) id: string, @Res({ passthrough: true }) res: Response) {
    noStore(res);
    return this.service.detail(id);
  }

  @Post(':id/respond')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.verificationQueriesRead, PERMISSIONS.verificationQueriesRespond)
  @ApiBody({ schema: openApiRequestSchema(respondVerificationQuerySchema) })
  @ApiOkResponse({ standardSchema: staffVerificationQuerySchema })
  respond(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(respondVerificationQuerySchema)) body: RespondVerificationQuery,
  ) {
    return this.service.respond(id, body, auth.user.id);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.verificationQueriesRead, PERMISSIONS.verificationQueriesRespond)
  @ApiBody({ schema: openApiRequestSchema(resolveVerificationQuerySchema) })
  @ApiOkResponse({ standardSchema: staffVerificationQuerySchema })
  resolve(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(resolveVerificationQuerySchema)) body: ResolveVerificationQuery,
  ) {
    return this.service.resolve(id, body.version, auth.user.id);
  }
}
