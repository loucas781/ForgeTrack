'use strict'
/**
 * permissions.js
 *
 * Roles (ascending privilege):
 *   member  — view, create issues, comment, delete own comments,
 *             update status on issues assigned to them
 *   lead    — all member rights + create/edit/delete projects they lead,
 *             full edit/delete any issue, delete any comment in their projects
 *   admin   — unrestricted
 *
 * Helpers used in route handlers:
 *   isAdmin(user)                           → bool
 *   isLead(user)                            → bool (lead or admin)
 *   canManageProject(user, proj)            → bool (admin, or lead who is the project lead)
 *   canEditIssue(user, proj)                → bool (admin, or lead who leads that project)
 *   canUpdateIssueStatus(user, issue, proj) → bool (above + assignee of the issue)
 *   canDeleteComment(user, comment, proj)   → bool
 *   requireRole(minRole)                    → Express middleware
 */

const ROLE_RANK = { member: 0, lead: 1, admin: 2 }

function rank(role) { return ROLE_RANK[role] ?? 0 }

function isAdmin(user) { return user?.role === 'admin' }
function isLead(user)  { return rank(user?.role) >= rank('lead') }

/**
 * True if the user may create/edit/delete the given project.
 * proj must have a lead_id field.
 */
function canManageProject(user, proj) {
  if (isAdmin(user)) return true
  if (user?.role === 'lead' && proj?.lead_id === user.id) return true
  return false
}

/**
 * True if the user may fully edit or delete issues within the project
 * (title, description, priority, type, reassign, delete).
 */
function canEditIssue(user, proj) {
  return canManageProject(user, proj)
}

/**
 * True if the user may update the status of a specific issue.
 * Extends canEditIssue to also allow the assignee of that issue.
 * issue must have assignee_id.
 */
function canUpdateIssueStatus(user, issue, proj) {
  if (canEditIssue(user, proj)) return true
  if (user?.id && issue?.assignee_id === user.id) return true
  return false
}

/**
 * True if the user may delete the given comment.
 * comment must have author_id. proj (optional) for lead scoping.
 */
function canDeleteComment(user, comment, proj) {
  if (isAdmin(user)) return true
  if (comment?.author_id === user?.id) return true
  // A lead can delete any comment in a project they lead
  if (user?.role === 'lead' && proj?.lead_id === user.id) return true
  return false
}

/**
 * Express middleware: require at least minRole.
 * Usage: router.post('/', requireRole('lead'), handler)
 */
function requireRole(minRole) {
  return (req, res, next) => {
    if (rank(req.user?.role) >= rank(minRole)) return next()
    res.status(403).json({ error: 'You do not have permission to perform this action.' })
  }
}

module.exports = { isAdmin, isLead, canManageProject, canEditIssue, canUpdateIssueStatus, canDeleteComment, requireRole, rank }
