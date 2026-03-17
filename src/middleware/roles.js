// Role-Based Access Control (RBAC)
// Usage: router.get('/admin', protect, authorize('admin', 'moderator'), handler)

exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Phải đăng nhập trước' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Vai trò "${req.user.role}" không có quyền thực hiện hành động này`,
      });
    }
    next();
  };
};

// Check if user is owner of resource or admin/mod
exports.ownerOrAdmin = (userIdField = 'user') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Phải đăng nhập trước' });
    }
    // Admin, moderator, and superadmin bypass ownership check
    if (['admin', 'moderator', 'superadmin'].includes(req.user.role)) return next();

    // Check if user is owner (resource must be loaded in req.resource)
    if (req.resource && req.resource[userIdField]?.toString() === req.user._id.toString()) {
      return next();
    }
    return res.status(403).json({ success: false, message: 'Không có quyền chỉnh sửa tài nguyên này' });
  };
};
