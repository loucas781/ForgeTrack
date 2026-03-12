'use strict'
/**
 * permissions.js
 *
 * Roles (ascending privilege):
 *   member    — view, create issues, comment, delete own comments,
 *               update status on issues assigned to them,
 *               edit their own issues (title, desc, labels, dates)
 *   engineer — all member rights + can set/update assignee_id on any issue
 *               (intended for picking up unassigned issues or reassigning to self)
 *   lead      — all engineer rights + manage projects they lead,
 *               full edit/delete any issue in their project (incl. priority & type)
 *   admin     — unrestricted
 *
 * Helpers:
 *   isAdmin(user)                              → bool
 *   isLead(user)                               → bool (lead or admin)
 *   isEngineer(user)                          → bool (engineer, lead, or admin)
 *   canManageProject(user, proj)               → bool (admin, or lead who leads the project)
 *   canEditIssue(user, proj)                   → bool (admin, or lead who leads that project)
 *   canEditOwnIssue(user, issue, proj)         → bool (above + creator of the issue)
 *   canEditIssueMeta(user, proj)               → bool (priority/type — leads/admins only)
 *   canUpdateIssueStatus(user, issue, proj)    → bool (above + assignee of the issue)
 *   canClaimIssue(user)                        → bool (engineers, leads, admins can modify assignee)
 *   canDeleteComment(user, comment, proj)      → bool
 *   requireRole(minRole)                       → Express middleware
 */

const ROLE_RANK = { member: 0, engineer: 1, lead: 2, admin: 3 }

function rank(role) { return ROLE_RANK[role] ?? 0 }

function isAdmin(user)     { return user?.role === 'admin' }
function isLead(user)      { return rank(user?.role) >= rank('lead') }
function isEngineer(user) { return rank(user?.role) >= rank('engineer') }

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
 * (all fields including priority and type).
 * Admin or the project lead only.
 */
function canEditIssue(user, proj) {
  return canManageProject(user, proj)
}

/**
 * True if the user may edit or delete a specific issue.
 * Extends canEditIssue to also allow the creator of that issue.
 * Members can edit their own issues but NOT priority/type (see canEditIssueMeta).
 * issue must have created_by.
 */
function canEditOwnIssue(user, issue, proj) {
  if (canEditIssue(user, proj)) return true
  if (user?.id && issue?.created_by === user.id) return true
  return false
}

/**
 * True if the user may change priority or type of an issue.
 * Restricted to leads/admins only — same as canEditIssue.
 */
function canEditIssueMeta(user, proj) {
  return canEditIssue(user, proj)
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
 * True if the user may set or change the assignee_id on an issue.
 * Engineers (and above) can do this — intended for picking up unassigned
 * issues or reassigning to themselves.
 */
function canClaimIssue(user) {
  return isEngineer(user)
}

/**
 * True if the user may delete the given comment.
 * comment must have author_id. proj (optional) for lead scoping.
 */
function canDeleteComment(user, comment, proj) {
  if (isAdmin(user)) return true
  if (comment?.author_id === user?.id) return true
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

module.exports = { isAdmin, isLead, isEngineer, canManageProject, canEditIssue, canEditOwnIssue, canEditIssueMeta, canUpdateIssueStatus, canClaimIssue, canDeleteComment, requireRole, rank }
