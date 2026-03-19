// Server-Sent Events — client registry and broadcast helper
// Map<projectId, Set<res>>  (project-scoped)
// Map<issueId,   Set<res>>  (issue-scoped)

const projectClients = new Map()
const issueClients   = new Map()

function addClient(map, key, res) {
  if (!map.has(key)) map.set(key, new Set())
  map.get(key).add(res)
}

function removeClient(map, key, res) {
  const set = map.get(key)
  if (!set) return
  set.delete(res)
  if (set.size === 0) map.delete(key)
}

function broadcast(map, key, eventType, data) {
  const set = map.get(key)
  if (!set || set.size === 0) return
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of set) {
    try { res.write(payload) } catch (_) { /* client disconnected */ }
  }
}

module.exports = {
  // Subscribe a response object to project-scoped events
  subscribeProject(projectId, res) {
    addClient(projectClients, projectId, res)
    return () => removeClient(projectClients, projectId, res)
  },

  // Subscribe a response object to issue-scoped events
  subscribeIssue(issueId, res) {
    addClient(issueClients, issueId, res)
    return () => removeClient(issueClients, issueId, res)
  },

  // Broadcast a project-level event (issue list changes)
  broadcastProject(projectId, eventType, data) {
    broadcast(projectClients, projectId, eventType, data)
  },

  // Broadcast an issue-level event (comment/field changes)
  broadcastIssue(issueId, eventType, data) {
    broadcast(issueClients, issueId, eventType, data)
  },
}
