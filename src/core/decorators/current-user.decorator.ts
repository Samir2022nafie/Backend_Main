import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from '../common/types';

export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
