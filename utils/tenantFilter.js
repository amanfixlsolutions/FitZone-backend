const AppError = require("./AppError");

/** Gym/tenant id for gym-owner and member (null for super-admin). */
const getTenantGymId = (user) => {
  if (!user || user.role === "super-admin") return null;
  return user.gym || user.tenantId || null;
};

/** Apply gym scope to list/query filters. Members and gym-owners are locked to their gym. */
const applyGymScope = (filter, req) => {
  const { user } = req;
  const queryGymId = req.query?.gymId || req.query?.gym;

  if (!user) {
    if (queryGymId) filter.gym = queryGymId;
    return filter;
  }

  if (user.role === "super-admin") {
    if (queryGymId) filter.gym = queryGymId;
    return filter;
  }

  const tenantGym = getTenantGymId(user);
  if (tenantGym) {
    if (queryGymId && String(queryGymId) !== String(tenantGym)) {
      throw new AppError("Access denied. You can only access your gym's data.", 403);
    }
    filter.gym = tenantGym;
    return filter;
  }

  if (queryGymId) filter.gym = queryGymId;
  return filter;
};

/** Find the member row for a logged-in user within their tenant gym. */
const findMemberForUser = async (user, Member, extra = {}) => {
  if (!user?.email) return null;

  const gymId = getTenantGymId(user);
  const filter = { email: user.email.toLowerCase(), ...extra };

  if (gymId) {
    filter.gym = gymId;
    return Member.findOne(filter);
  }

  if (user._id) {
    const byUser = await Member.findOne({ user: user._id, ...extra }).sort({ createdAt: -1 });
    if (byUser) return byUser;
  }

  return Member.findOne(filter);
};

/** Reject access when a resource belongs to another gym. */
const assertSameTenant = (user, resource) => {
  if (!resource || !user || user.role === "super-admin") return;

  const tenantGym = getTenantGymId(user);
  if (!tenantGym) return;

  const resourceGym = resource.gym?._id || resource.gym;
  if (resourceGym && String(resourceGym) !== String(tenantGym)) {
    throw new AppError("Access denied. You can only access your gym's data.", 403);
  }
};

module.exports = {
  getTenantGymId,
  applyGymScope,
  findMemberForUser,
  assertSameTenant,
};
