import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [SessionService, SessionGuard],
  exports: [SessionService, SessionGuard],
})
export class AuthModule {}
