import {
  BoxRenderable,
  DiffRenderable,
  InputRenderable,
  InputRenderableEvents,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
  type CliRenderer,
  type KeyEvent,
  type SelectOption,
} from "@opentui/core"
import type { AgentEvent, AgentSession } from "../core/agent-session"
import { timelineEvents } from "../core/agent-session"
import { copyTextToClipboard } from "../core/clipboard"
import { formatEventPlain, formatSessionPlain } from "../core/export"
import { formatConversationDate } from "../core/format"
import { formatSessionSummaryLine, sessionSummary } from "../core/session-summary"
import { getDatabase, index } from "../core/index"
import type { Project, Session } from "../core/types"
import { getAgentSession, listProjects, listSessions, searchSessions } from "../db/store"
import {
  formatEventDetailPlain,
  formatFileEditHeader,
  formatFileEditUnifiedDiff,
} from "./event-detail"
import {
  CATEGORY_BY_KEY,
  formatCategoryFilterLine,
  formatTimelineEventName,
  filterTimelineEvents,
  isErrorEvent,
  type TimelineCategory,
} from "./timeline"
import { theme } from "./theme"

type SearchJumpTarget = {
  projectId: number
  sessionId: number
  eventId: number
}

export async function runApp(): Promise<void> {
  await index()

  const db = getDatabase()
  const projects = listProjects(db)

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
  })

  renderer.setBackgroundColor(theme.bg)
  await buildUi(renderer, db, projects)
  renderer.start()
}

async function buildUi(
  renderer: CliRenderer,
  db: ReturnType<typeof getDatabase>,
  projects: Project[],
) {
  const root = new BoxRenderable(renderer, {
    id: "root",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: theme.bg,
  })

  const header = new BoxRenderable(renderer, {
    id: "header",
    height: 3,
    border: true,
    borderColor: theme.border,
    backgroundColor: theme.headerBg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 1,
    paddingRight: 1,
    flexShrink: 0,
  })
  header.add(
    new TextRenderable(renderer, {
      id: "header-text",
      content: "AGExplorer — Session Explorer",
      fg: theme.title,
      flexShrink: 0,
    }),
  )
  const headerProject = new TextRenderable(renderer, {
    id: "header-project",
    content: "",
    fg: theme.desc,
    flexShrink: 1,
  })
  header.add(headerProject)

  const body = new BoxRenderable(renderer, {
    id: "body",
    flexDirection: "row",
    flexGrow: 1,
    flexShrink: 1,
    width: "100%",
  })

  const projectPane = new BoxRenderable(renderer, {
    id: "project-pane",
    width: 44,
    border: true,
    borderColor: theme.border,
    focusedBorderColor: theme.borderFocus,
    title: " Projects ",
    titleAlignment: "left",
    flexShrink: 0,
    backgroundColor: theme.panel,
  })

  const projectOptions: SelectOption[] =
    projects.length === 0
      ? [
          {
            name: "(none found)",
            description: "No indexed projects — run ag-explorer index",
            value: null,
          },
        ]
      : projects.map((project) => ({
          name: project.name,
          description: `${project.sessionCount} session${project.sessionCount === 1 ? "" : "s"} · last ${formatConversationDate(project.lastSessionAt)}`,
          value: project.id,
        }))

  const selectColors = {
    backgroundColor: theme.panel,
    focusedBackgroundColor: theme.panelAlt,
    textColor: theme.text,
    focusedTextColor: theme.textBright,
    selectedBackgroundColor: theme.selectedBg,
    selectedTextColor: theme.selectedText,
    descriptionColor: theme.desc,
    selectedDescriptionColor: theme.selectedDesc,
  } as const

  const projectSelect = new SelectRenderable(renderer, {
    id: "project-select",
    width: "100%",
    height: "100%",
    options: projectOptions,
    ...selectColors,
    showDescription: true,
    wrapSelection: true,
    showScrollIndicator: true,
  })
  projectPane.add(projectSelect)

  const sessionPane = new BoxRenderable(renderer, {
    id: "session-pane",
    width: 42,
    border: true,
    borderColor: theme.border,
    focusedBorderColor: theme.borderFocus,
    title: " Sessions ",
    titleAlignment: "left",
    flexShrink: 0,
    backgroundColor: theme.panel,
  })

  const sessionSelect = new SelectRenderable(renderer, {
    id: "session-select",
    width: "100%",
    height: "100%",
    options: [{ name: "Select a project", description: "", value: null }],
    ...selectColors,
    showDescription: true,
    wrapSelection: true,
    showScrollIndicator: true,
  })
  sessionPane.add(sessionSelect)

  const timelinePane = new BoxRenderable(renderer, {
    id: "timeline-pane",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    border: true,
    borderColor: theme.border,
    focusedBorderColor: theme.borderFocus,
    title: " Session Timeline ",
    titleAlignment: "left",
    backgroundColor: theme.panel,
  })

  const filterBox = new BoxRenderable(renderer, {
    id: "filter-box",
    height: 3,
    border: true,
    borderColor: theme.border,
    focusedBorderColor: theme.borderFocus,
    flexShrink: 0,
    marginBottom: 1,
  })

  const filterInput = new InputRenderable(renderer, {
    id: "filter-input",
    width: "100%",
    placeholder: "Filter timeline...",
    backgroundColor: theme.inputBg,
    focusedBackgroundColor: theme.inputFocusBg,
    textColor: theme.textBright,
    focusedTextColor: theme.textBright,
    placeholderColor: theme.placeholder,
    cursorColor: theme.cursor,
  })
  filterBox.add(filterInput)

  const categoryFilterBox = new BoxRenderable(renderer, {
    id: "category-filter-box",
    height: 2,
    flexShrink: 0,
    marginBottom: 1,
    paddingLeft: 1,
    backgroundColor: theme.panel,
  })

  const categoryFilterText = new TextRenderable(renderer, {
    id: "category-filter-text",
    content: formatCategoryFilterLine("all"),
    fg: theme.muted,
  })
  categoryFilterBox.add(categoryFilterText)

  const summaryBox = new BoxRenderable(renderer, {
    id: "summary-box",
    height: 2,
    flexShrink: 0,
    marginBottom: 1,
    paddingLeft: 1,
    backgroundColor: theme.panel,
  })

  const summaryText = new TextRenderable(renderer, {
    id: "summary-text",
    content: "",
    fg: theme.footerText,
  })
  summaryBox.add(summaryText)

  const timelineListBox = new BoxRenderable(renderer, {
    id: "timeline-list-box",
    flexGrow: 1,
    flexShrink: 1,
    backgroundColor: theme.panel,
  })

  const timelineSelect = new SelectRenderable(renderer, {
    id: "timeline-select",
    width: "100%",
    height: "100%",
    options: [{ name: "Select a session", description: "", value: null }],
    ...selectColors,
    showDescription: true,
    wrapSelection: false,
    showScrollIndicator: true,
  })
  timelineListBox.add(timelineSelect)

  const detailBox = new BoxRenderable(renderer, {
    id: "detail-box",
    height: 12,
    border: true,
    borderColor: theme.border,
    focusedBorderColor: theme.borderFocus,
    flexShrink: 0,
    marginTop: 1,
    title: " Event Detail ",
    titleAlignment: "left",
    backgroundColor: theme.panelAlt,
  })

  const detailScroll = new ScrollBoxRenderable(renderer, {
    id: "detail-scroll",
    flexGrow: 1,
    width: "100%",
    scrollX: false,
    scrollY: true,
    rootOptions: { backgroundColor: theme.panelAlt, border: false },
    wrapperOptions: { backgroundColor: theme.panelAlt, border: false },
    viewportOptions: { backgroundColor: theme.panelAlt, border: false },
    contentOptions: { backgroundColor: theme.panelAlt, border: false },
  })

  const detailText = new TextRenderable(renderer, {
    id: "detail-text",
    content: "Select an event",
    fg: theme.muted,
    selectable: true,
    width: "100%",
    flexShrink: 0,
  })

  const detailEditHeader = new TextRenderable(renderer, {
    id: "detail-edit-header",
    content: "",
    fg: theme.text,
    selectable: true,
    width: "100%",
    flexShrink: 0,
    visible: false,
  })

  const detailDiff = new DiffRenderable(renderer, {
    id: "detail-diff",
    view: "unified",
    diff: "",
    width: "100%",
    flexShrink: 0,
    wrapMode: "word",
    showLineNumbers: false,
    addedBg: "#1a3d2e",
    removedBg: "#3d1a2e",
    addedSignColor: theme.agentLabel,
    removedSignColor: theme.userLabel,
    visible: false,
  })

  detailScroll.add(detailText)
  detailScroll.add(detailEditHeader)
  detailScroll.add(detailDiff)

  detailBox.add(detailScroll)
  timelinePane.add(filterBox)
  timelinePane.add(categoryFilterBox)
  timelinePane.add(summaryBox)
  timelinePane.add(timelineListBox)
  timelinePane.add(detailBox)

  const searchBox = new BoxRenderable(renderer, {
    id: "search-box",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    visible: false,
  })

  const searchInputBox = new BoxRenderable(renderer, {
    id: "search-input-box",
    height: 3,
    border: true,
    borderColor: theme.border,
    focusedBorderColor: theme.borderFocus,
    flexShrink: 0,
    marginBottom: 1,
  })

  const searchInput = new InputRenderable(renderer, {
    id: "search-input",
    width: "100%",
    placeholder: "Search history… (project:demo JWT)",
    backgroundColor: theme.inputBg,
    focusedBackgroundColor: theme.inputFocusBg,
    textColor: theme.textBright,
    focusedTextColor: theme.textBright,
    placeholderColor: theme.placeholder,
    cursorColor: theme.cursor,
  })
  searchInputBox.add(searchInput)

  const searchResultsBox = new BoxRenderable(renderer, {
    id: "search-results-box",
    flexGrow: 1,
    flexShrink: 1,
    border: true,
    borderColor: theme.border,
    focusedBorderColor: theme.borderFocus,
    title: " Search Results ",
    titleAlignment: "left",
    backgroundColor: theme.panel,
  })

  const searchSelect = new SelectRenderable(renderer, {
    id: "search-select",
    width: "100%",
    height: "100%",
    options: [{ name: "Type a query and press Enter", description: "", value: null }],
    ...selectColors,
    showDescription: true,
    wrapSelection: false,
    showScrollIndicator: true,
  })
  searchResultsBox.add(searchSelect)
  searchBox.add(searchInputBox)
  searchBox.add(searchResultsBox)
  timelinePane.add(searchBox)

  const footer = new BoxRenderable(renderer, {
    id: "footer",
    height: 3,
    border: true,
    borderColor: theme.border,
    backgroundColor: theme.footerBg,
    flexShrink: 0,
    alignItems: "center",
    paddingLeft: 1,
  })
  const footerText = new TextRenderable(renderer, {
    id: "footer-text",
    content: defaultFooterText(),
    fg: theme.footerText,
  })
  footer.add(footerText)

  body.add(projectPane)
  body.add(sessionPane)
  body.add(timelinePane)
  root.add(header)
  root.add(body)
  root.add(footer)
  renderer.root.add(root)

  const allFocusables = [projectSelect, sessionSelect, filterInput, timelineSelect, detailScroll] as const
  const allFocusBoxes = [projectPane, sessionPane, filterBox, timelineListBox, detailBox] as const
  const searchFocusables = [searchInput, searchSelect] as const
  const searchFocusBoxes = [searchInputBox, searchResultsBox] as const
  let focusIndex = 0
  let searchFocusIndex = 0
  let projectsExpanded = true

  const projectById = new Map(projects.map((project) => [project.id, project]))
  let sessionsById = new Map<number, Session>()
  let currentSession: AgentSession | null = null
  let visibleEvents: AgentEvent[] = []
  let activeCategory: TimelineCategory = "all"
  let detailExpanded = true
  let searchMode = false
  let statusResetTimer: ReturnType<typeof setTimeout> | null = null
  let loadGeneration = 0

  function defaultFooter(): string {
    return defaultFooterText(searchMode, projectsExpanded)
  }

  const focusTargets = () => {
    if (projectsExpanded) {
      return {
        focusables: [...allFocusables],
        focusBoxes: [...allFocusBoxes],
      }
    }
    return {
      focusables: [sessionSelect, filterInput, timelineSelect, detailScroll],
      focusBoxes: [sessionPane, filterBox, timelineListBox, detailBox],
    }
  }

  const focusedElement = () => focusTargets().focusables[focusIndex]

  const focusIndexOf = (el: (typeof allFocusables)[number]) => {
    const index = focusTargets().focusables.indexOf(el)
    return index >= 0 ? index : 0
  }

  const selectedProject = (): Project | null => {
    const selected = projectSelect.getSelectedOption()
    const projectId = selected?.value
    if (!projectId || typeof projectId !== "number") return null
    return projectById.get(projectId) ?? null
  }

  const updateSessionPaneTitle = (project: Project | null) => {
    if (!project) {
      sessionPane.title = " Sessions "
      return
    }
    const maxName = 28
    const name =
      project.name.length > maxName ? `${project.name.slice(0, maxName - 1)}…` : project.name
    sessionPane.title = ` Sessions · ${name} `
  }

  const updateHeaderProject = (project: Project | null) => {
    if (!project) {
      headerProject.content = projects.length === 0 ? "No projects indexed" : "No project selected"
      headerProject.fg = theme.muted
      return
    }
    const sessions =
      `${project.sessionCount} session${project.sessionCount === 1 ? "" : "s"}`
    headerProject.content = `${project.name}  ·  ${sessions}  ·  last ${formatConversationDate(project.lastSessionAt)}`
    headerProject.fg = theme.desc
  }

  const setProjectsExpanded = (expanded: boolean) => {
    projectsExpanded = expanded
    projectPane.visible = expanded
  }

  const collapseProjectsPane = (options?: { focusSessions?: boolean }) => {
    if (!projectsExpanded) {
      if (options?.focusSessions) setFocus(focusIndexOf(sessionSelect))
      return
    }

    const previous = focusedElement()
    setProjectsExpanded(false)
    if (options?.focusSessions || previous === projectSelect) {
      setFocus(0)
    } else if (previous) {
      setFocus(focusIndexOf(previous as (typeof allFocusables)[number]))
    } else {
      setFocus(0)
    }

    if (!statusResetTimer) {
      footerText.content = defaultFooter()
      footerText.fg = theme.footerText
    }
  }

  const toggleProjectsPane = () => {
    if (projectsExpanded) {
      collapseProjectsPane({ focusSessions: focusedElement() === projectSelect })
      flashFooter("Projects hidden — Ctrl+[ to show")
      return
    }

    setProjectsExpanded(true)
    setFocus(0)
    flashFooter("Projects shown")
  }

  const setTimelineVisible = (visible: boolean) => {
    filterBox.visible = visible
    categoryFilterBox.visible = visible
    summaryBox.visible = visible
    timelineListBox.visible = visible
    detailBox.visible = visible
    searchBox.visible = !visible
  }

  const setSearchFocus = (index: number) => {
    searchFocusIndex = (index + searchFocusables.length) % searchFocusables.length
    searchFocusables.forEach((el) => el.blur())
    searchFocusBoxes.forEach((box) => box.blur())
    searchFocusables[searchFocusIndex].focus()
    searchFocusBoxes[searchFocusIndex].focus()
  }

  const flashFooter = (message: string, ok = true) => {
    footerText.content = message
    footerText.fg = ok ? theme.agentLabel : theme.userLabel
    if (statusResetTimer) clearTimeout(statusResetTimer)
    statusResetTimer = setTimeout(() => {
      footerText.content = defaultFooter()
      footerText.fg = theme.footerText
    }, 2200)
  }

  const setFocus = (index: number) => {
    if (searchMode) {
      setSearchFocus(index)
      return
    }

    const { focusables, focusBoxes } = focusTargets()
    focusIndex = ((index % focusables.length) + focusables.length) % focusables.length
    allFocusables.forEach((el) => el.blur())
    allFocusBoxes.forEach((box) => box.blur())
    focusables[focusIndex]!.focus()
    focusBoxes[focusIndex]!.focus()
  }

  const timelineOptionsFromEvents = (events: AgentEvent[]): SelectOption[] => {
    if (events.length === 0) {
      return [{ name: "(no events)", description: "", value: null }]
    }

    return events.map((event, index) => ({
      name: formatTimelineEventName(event),
      description: index < events.length - 1 ? "↓" : "",
      value: event.id,
    }))
  }

  const updateSummaryStrip = () => {
    if (!currentSession) {
      summaryText.content = ""
      return
    }
    summaryText.content = formatSessionSummaryLine(sessionSummary(currentSession.events))
  }

  const updateCategoryFilterLine = () => {
    categoryFilterText.content = `Filter: ${formatCategoryFilterLine(activeCategory)}`
  }

  const renderDetail = (event: AgentEvent | null, expanded: boolean) => {
    detailEditHeader.visible = false
    detailDiff.visible = false
    detailText.visible = true

    if (!event) {
      detailText.content = "Select an event"
      detailText.fg = theme.muted
      return
    }

    if (!expanded) {
      detailText.content = `${event.label} ${event.summary}`
      detailText.fg = theme.muted
      return
    }

    if (event.type === "file_edit") {
      const patch = formatFileEditUnifiedDiff(event)
      if (patch) {
        detailText.visible = false
        detailEditHeader.visible = true
        detailDiff.visible = true
        detailEditHeader.content = formatFileEditHeader(event)
        detailEditHeader.fg = theme.text
        detailDiff.diff = patch
        detailScroll.scrollTop = 0
        return
      }
    }

    detailText.content = formatEventDetailPlain(event)
    detailText.fg = theme.text
    detailScroll.scrollTop = 0
  }

  const refreshTimeline = (options?: { selectEventId?: number; expandDetail?: boolean }) => {
    updateCategoryFilterLine()

    if (!currentSession) {
      visibleEvents = []
      summaryText.content = ""
      timelineSelect.options = [{ name: "Select a session", description: "", value: null }]
      renderDetail(null, false)
      return
    }

    updateSummaryStrip()
    visibleEvents = filterTimelineEvents(currentSession.events, filterInput.value, activeCategory)
    timelineSelect.options = timelineOptionsFromEvents(visibleEvents)

    if (options?.selectEventId !== undefined) {
      const index = visibleEvents.findIndex((event) => event.id === options.selectEventId)
      timelineSelect.setSelectedIndex(index >= 0 ? index : 0)
    } else {
      timelineSelect.setSelectedIndex(0)
    }

    const expandDetail = options?.expandDetail ?? true
    detailExpanded = expandDetail
    const selected = visibleEvents[timelineSelect.getSelectedIndex()] ?? visibleEvents[0] ?? null
    renderDetail(selected, detailExpanded)
  }

  const setCategory = (category: TimelineCategory) => {
    const previous = selectedTimelineEvent()
    activeCategory = category
    refreshTimeline({ selectEventId: previous?.id })
  }

  const jumpToError = (direction: 1 | -1) => {
    const errors = visibleEvents.filter(isErrorEvent)
    if (errors.length === 0) {
      flashFooter("No errors in view", false)
      return
    }

    const current = selectedTimelineEvent()
    let index = current ? errors.findIndex((event) => event.id === current.id) : -1

    if (index < 0) {
      index = direction > 0 ? 0 : errors.length - 1
    } else {
      index = (index + direction + errors.length) % errors.length
    }

    const target = errors[index]
    if (!target) return

    refreshTimeline({ selectEventId: target.id, expandDetail: true })
    setFocus(focusIndexOf(timelineSelect))
    flashFooter(`Error ${index + 1}/${errors.length}`)
  }

  const runGlobalSearch = () => {
    const query = searchInput.value.trim()
    if (!query) {
      searchSelect.options = [{ name: "Enter a search query", description: "", value: null }]
      return
    }

    const groups = searchSessions(db, query)
    if (groups.length === 0) {
      searchSelect.options = [{ name: "No matches found", description: query, value: null }]
      return
    }

    searchSelect.options = groups.map((group) => {
      const matchLabel = group.matchCount === 1 ? "1 match" : `${group.matchCount} matches`
      const firstHit = group.hits[0]
      return {
        name: `${group.sessionTitle}  ${matchLabel}`,
        description: `${group.projectName} · ${firstHit?.snippet ?? ""}`,
        value: firstHit
          ? ({
              projectId: group.projectId,
              sessionId: group.sessionId,
              eventId: firstHit.eventId,
            } satisfies SearchJumpTarget)
          : null,
      }
    })
    searchSelect.setSelectedIndex(0)
    setSearchFocus(1)
  }

  const exitSearchMode = () => {
    searchMode = false
    setTimelineVisible(true)
    footerText.content = defaultFooter()
    setFocus(focusIndex)
  }

  const enterSearchMode = () => {
    searchMode = true
    setTimelineVisible(false)
    searchSelect.options = [{ name: "Type a query and press Enter", description: "", value: null }]
    footerText.content = searchFooterText()
    setSearchFocus(0)
  }

  const jumpToSearchHit = async (target: SearchJumpTarget) => {
    const projectIndex = projects.findIndex((project) => project.id === target.projectId)
    if (projectIndex < 0) {
      flashFooter("Search result project missing", false)
      return
    }

    projectSelect.setSelectedIndex(projectIndex)
    await loadSelectedProject()

    const sessions = listSessions(db, target.projectId)
    const sessionIndex = sessions.findIndex((session) => session.id === target.sessionId)
    if (sessionIndex < 0) {
      flashFooter("Search result session missing", false)
      return
    }

    sessionSelect.setSelectedIndex(sessionIndex)
    await loadSelectedSession()

    filterInput.value = ""
    activeCategory = "all"
    refreshTimeline({ selectEventId: target.eventId })
    exitSearchMode()
    setFocus(focusIndexOf(timelineSelect))
    flashFooter("Jumped to matching event")
  }

  const selectedTimelineEvent = (): AgentEvent | null => {
    const selected = timelineSelect.getSelectedOption()
    const eventId = selected?.value
    if (!eventId || typeof eventId !== "number") return null
    return visibleEvents.find((event) => event.id === eventId) ?? null
  }

  const focusDetail = () => {
    const event = selectedTimelineEvent()
    if (!event) return
    detailExpanded = true
    renderDetail(event, true)
    setFocus(focusIndexOf(detailScroll))
  }

  const copyCurrent = async () => {
    const event = selectedTimelineEvent()
    if (event) {
      try {
        await copyTextToClipboard(formatEventPlain(event), renderer)
        flashFooter(`Copied ${event.label} event detail`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        flashFooter(`Copy failed: ${message}`, false)
      }
      return
    }

    if (!currentSession) {
      flashFooter("Nothing to copy — select a session first", false)
      return
    }

    try {
      await copyTextToClipboard(formatSessionPlain(currentSession), renderer)
      flashFooter(
        `Copied session timeline (${timelineEvents(currentSession).length} events)`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      flashFooter(`Copy failed: ${message}`, false)
    }
  }

  const setSessionOptions = (sessions: Session[], emptyLabel: string) => {
    sessionsById = new Map(sessions.map((session) => [session.id, session]))
    sessionSelect.options =
      sessions.length === 0
        ? [{ name: emptyLabel, description: "", value: null }]
        : sessions.map((session) => ({
            name: session.title,
            description: formatConversationDate(session.updatedAt),
            value: session.id,
          }))
    sessionSelect.setSelectedIndex(0)
  }

  const loadSelectedSession = async () => {
    const generation = ++loadGeneration
    const selected = sessionSelect.getSelectedOption()
    const sessionId = selected?.value
    if (!sessionId || typeof sessionId !== "number") {
      currentSession = null
      refreshTimeline()
      return
    }

    const session = sessionsById.get(sessionId)
    if (!session) {
      currentSession = null
      refreshTimeline()
      return
    }

    timelineSelect.options = [{ name: "Loading timeline…", description: "", value: null }]
    detailText.content = "Loading timeline…"
    detailText.fg = theme.muted
    activeCategory = "all"
    filterInput.value = ""

    try {
      const agentSession = await getAgentSession(db, sessionId)
      if (generation !== loadGeneration) return
      currentSession = agentSession
      refreshTimeline()
    } catch (error) {
      if (generation !== loadGeneration) return
      currentSession = null
      const message = error instanceof Error ? error.message : String(error)
      timelineSelect.options = [{ name: "Failed to load session", description: message, value: null }]
      detailText.content = `Failed to load session:\n${message}`
      detailText.fg = theme.userLabel
    }
  }

  const loadSelectedProject = async () => {
    const generation = ++loadGeneration
    const selected = projectSelect.getSelectedOption()
    const projectId = selected?.value
    if (!projectId || typeof projectId !== "number") {
      updateSessionPaneTitle(null)
      updateHeaderProject(null)
      setSessionOptions([], "No project selected")
      currentSession = null
      refreshTimeline()
      return
    }

    const project = projectById.get(projectId)
    if (!project) {
      updateSessionPaneTitle(null)
      updateHeaderProject(null)
      setSessionOptions([], "Project missing")
      return
    }

    updateSessionPaneTitle(project)
    updateHeaderProject(project)
    sessionSelect.options = [{ name: "Loading sessions…", description: "", value: null }]
    currentSession = null
    refreshTimeline()

    try {
      const sessions = listSessions(db, projectId)
      if (generation !== loadGeneration) return
      setSessionOptions(sessions, "No sessions in project")
      await loadSelectedSession()
    } catch (error) {
      if (generation !== loadGeneration) return
      setSessionOptions([], "Failed to load sessions")
      const message = error instanceof Error ? error.message : String(error)
      timelineSelect.options = [{ name: "Failed to load sessions", description: message, value: null }]
    }
  }

  projectSelect.on(SelectRenderableEvents.SELECTION_CHANGED, () => {
    void loadSelectedProject()
  })
  sessionSelect.on(SelectRenderableEvents.SELECTION_CHANGED, () => {
    void loadSelectedSession()
  })
  filterInput.on(InputRenderableEvents.INPUT, () => refreshTimeline())
  timelineSelect.on(SelectRenderableEvents.SELECTION_CHANGED, () => {
    detailExpanded = true
    renderDetail(selectedTimelineEvent(), true)
  })

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "tab") {
      if (searchMode) {
        setSearchFocus(searchFocusIndex + (key.shift ? -1 : 1))
      } else if (
        !key.shift &&
        projectsExpanded &&
        focusedElement() === projectSelect &&
        selectedProject()
      ) {
        collapseProjectsPane({ focusSessions: true })
      } else {
        setFocus(focusIndex + (key.shift ? -1 : 1))
      }
      key.preventDefault()
      return
    }

    if (key.name === "escape" && searchMode) {
      exitSearchMode()
      key.preventDefault()
      return
    }

    if (key.name === "/" && !searchMode && focusedElement() !== filterInput) {
      enterSearchMode()
      key.preventDefault()
      return
    }

    if (searchMode && key.name === "return") {
      if (searchFocusables[searchFocusIndex] === searchInput) {
        runGlobalSearch()
      } else {
        const selected = searchSelect.getSelectedOption()
        const value = selected?.value
        if (value && typeof value === "object") {
          void jumpToSearchHit(value as SearchJumpTarget)
        }
      }
      key.preventDefault()
      return
    }

    const projectFocused = !searchMode && focusedElement() === projectSelect
    if (key.name === "return" && projectFocused && selectedProject()) {
      collapseProjectsPane({ focusSessions: true })
      key.preventDefault()
      return
    }

    const timelineFocused = !searchMode && focusedElement() === timelineSelect
    if (key.name === "return" && timelineFocused) {
      focusDetail()
      key.preventDefault()
      return
    }

    const filterFocused = focusedElement() === filterInput
    const searchInputFocused = searchMode && searchFocusables[searchFocusIndex] === searchInput
    const typingFocused = filterFocused || searchInputFocused

    if (!searchMode && key.ctrl && key.name === "[" && !key.meta) {
      toggleProjectsPane()
      key.preventDefault()
      return
    }

    if (!searchMode && !typingFocused && key.name in CATEGORY_BY_KEY) {
      setCategory(CATEGORY_BY_KEY[key.name]!)
      key.preventDefault()
      return
    }

    if (!searchMode && key.ctrl && key.name === "]" && !key.meta) {
      jumpToError(1)
      key.preventDefault()
      return
    }

    const copyRequested =
      !searchMode &&
      ((key.name === "y" && !filterFocused && !key.ctrl && !key.meta) ||
        (key.name === "y" && key.ctrl))
    if (copyRequested) {
      void copyCurrent()
      key.preventDefault()
    }
  })

  setFocus(0)
  await loadSelectedProject()
}

function searchFooterText(): string {
  return "Enter search  ·  Enter open  ·  Esc back  ·  Tab focus"
}

function defaultFooterText(searchMode = false, projectsExpanded = true): string {
  if (searchMode) return searchFooterText()
  const projectsHint = projectsExpanded ? "Ctrl+[ hide projects" : "Ctrl+[ show projects"
  return `↑/↓ select  ·  0-6 filter  ·  Ctrl+] errors  ·  / search  ·  Enter focus detail  ·  ${projectsHint}  ·  y copy  ·  Ctrl+C quit`
}
