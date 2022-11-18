import { userParams } from "../../../utils/controller-filter";
import { connect } from "../../../../database";
import type { User } from "../../../../types/types";

type GetUserParams = {
  email?: string;
  id?: number;
  emailConfirmCode?: string;
};

// get a user from the database by email, id, or emailConfirmCode
async function getUser({
  email,
  id,
  emailConfirmCode,
}: GetUserParams): Promise<[User | null, any]> {
  const [collection] = connect("Users");
  const block = !email && !emailConfirmCode && typeof id === "undefined";

  // prevent user find on empty queries
  if (block) {
    return [null, collection];
  }

  const params = userParams({ email, id, emailConfirmCode });

  const user = (await collection.findOne(params)) as User;

  return [user, collection];
}

export { getUser };
