import { describe, expect, test } from "bun:test"
import { index } from "../../src/core/index"
import { applyAutoKnowledge } from "../../src/core/knowledge-sync"
import { openDatabase } from "../../src/db/schema"
import {
  insertKnowledge,
  listKnowledgeForSession,
  rematchKnowledgeSessionIds,
} from "../../src/db/knowledge-store"
import { clearAllIndexedData } from "../../src/core/writer"
import { getAgentSession, listProjects, listSessions } from "../../src/db/store"
import { setupTestEnv, teardownTestEnv } from "../helpers"

describe("knowledge_items", () => {
  test("rematches session ids after reindex", async () => {
    const dbPath = `${import.meta.dir}/../tmp-knowledge-${Date.now()}.sqlite`
    setupTestEnv({ dbPath })
    const db = openDatabase(dbPath)

    await index(db)

    const sessions = listSessions(db, listProjects(db)[0]!.id)
    const session = sessions[0]!
    const agentSession = await getAgentSession(db, session.id)
    expect(agentSession).not.toBeNull()

    insertKnowledge(db, {
      sessionId: session.id,
      sessionSourcePath: agentSession!.sourcePath,
      eventSeq: 0,
      type: "decision",
      title: "Bookmark",
      body: "Important decision",
      source: "bookmark",
      meta: {},
    })

    clearAllIndexedData(db)
    await index(db)

    const rematched = rematchKnowledgeSessionIds(db)
    expect(rematched).toBeGreaterThan(0)

    const restoredSessions = listSessions(db, listProjects(db)[0]!.id)
    const restored = listKnowledgeForSession(db, restoredSessions[0]!.id)
    expect(restored).toHaveLength(1)
    expect(restored[0]!.sessionId).toBe(restoredSessions[0]!.id)

    teardownTestEnv(dbPath)
  })

  test("auto knowledge stays off unless enabled", async () => {
    const dbPath = `${import.meta.dir}/../tmp-knowledge-auto-${Date.now()}.sqlite`
    setupTestEnv({ dbPath })
    const db = openDatabase(dbPath)

    await index(db)

    const sessions = listSessions(db, listProjects(db)[0]!.id)
    const agentSession = await getAgentSession(db, sessions[0]!.id)
    expect(agentSession).not.toBeNull()

    const previous = process.env.AG_EXPLORER_AUTO_KNOWLEDGE
    delete process.env.AG_EXPLORER_AUTO_KNOWLEDGE
    expect(applyAutoKnowledge(db, agentSession!)).toBe(0)

    process.env.AG_EXPLORER_AUTO_KNOWLEDGE = "1"
    const inserted = applyAutoKnowledge(db, agentSession!)
    expect(inserted).toBeGreaterThan(0)
    expect(listKnowledgeForSession(db, agentSession!.id).length).toBeGreaterThan(0)

    process.env.AG_EXPLORER_AUTO_KNOWLEDGE = previous
    teardownTestEnv(dbPath)
  })
})
