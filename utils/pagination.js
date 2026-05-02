/**
 * Build pagination metadata and apply skip/limit to a query
 * @param {Object} query - Mongoose query
 * @param {Object} reqQuery - req.query object
 * @returns {{ query, pagination }}
 */
exports.paginate = (query, reqQuery) => {
  const page  = Math.max(1, parseInt(reqQuery.page)  || 1);
  const limit = Math.min(100, parseInt(reqQuery.limit) || 20);
  const skip  = (page - 1) * limit;

  return {
    query: query.skip(skip).limit(limit),
    pagination: { page, limit, skip },
  };
};

exports.buildPaginationMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  pages: Math.ceil(total / limit),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});
