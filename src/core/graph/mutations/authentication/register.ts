import { EMAIL_ERROR } from "@app/core/strings";
import { cookieConfigs } from "@app/config";

// gql mutation function
export async function register(
  _,
  { email, password, googleId, githubId },
  context
) {
  const loginUser = await context.models.User.createUser({
    email,
    password,
    googleId,
    githubId,
  });

  if (!loginUser) {
    throw new Error(EMAIL_ERROR);
  }

  if (context?.res?.cookie) {
    context.res.cookie("jwt", loginUser.jwt, cookieConfigs);
  }

  return loginUser;
}
