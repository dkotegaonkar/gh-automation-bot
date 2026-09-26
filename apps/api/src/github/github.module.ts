import { Global, Module } from '@nestjs/common';
import { GithubAppService } from './github-app.service';
import { InstallationSyncService } from './installation-sync.service';

@Global()
@Module({
  providers: [GithubAppService, InstallationSyncService],
  exports: [GithubAppService, InstallationSyncService],
})
export class GithubModule {}
