import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Session, SESSION_COOKIE, SessionService } from './session.service';

type RequestWithSession = Request & { session?: Session };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestWithSession>();
    const session = await this.sessions.verify(req.cookies?.[SESSION_COOKIE]);
    if (!session) throw new UnauthorizedException();
    req.session = session;
    return true;
  }
}

export const CurrentSession = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Session => ctx.switchToHttp().getRequest<RequestWithSession>().session!,
);
