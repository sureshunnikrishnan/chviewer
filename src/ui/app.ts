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
import type { AgentEvent, AgentSession, SessionFile } from "../core/agent-session"
import { timelineEvents } from "../core/agent-session"
import { copyTextToClipboard } from "../core/clipboard"
import { formatEventPlain, formatSessionPlain } from "../core/export"
import type { GitSessionContext, NearbyCommit } from "../core/git"
import { resolveGitSessionContext } from "../core/git"
import {
  formatGitHeader,
  formatNearbyCommitDetail,
  gitCommitOptionDescription,
  gitCommitOptionLabel,
  gitFileOptionDescription,
  gitFileOptionLabel,
  loadGitFilePatch,
} from "../core/git-format"
import { formatConversationDate } from "../core/format"
import { knowledgeFromEvent } from "../core/knowledge"
import { applyAutoKnowledge } from "../core/knowledge-sync"
import {
  formatCompactOutcome,
  formatSessionIntelligenceReport,
  formatSessionOutcome,
  sessionOutcome,
} from "../core/session-intelligence"
import { formatSessionSummaryLine, sessionSummary } from "../core/session-summary"
import { getDatabase, index } from "../core/index"
import type { KnowledgeItem } from "../core/knowledge"
import { formatKnowledgeItemPlain } from "../core/knowledge"
import { insertKnowledge, listKnowledgeForSession } from "../db/knowledge-store"
import type { Project, Session } from "../core/types"
import { listConfiguredProviders } from "../providers/configured"
import { getProvider } from "../providers/registry"
import { getAgentSession, listProjects, listSessions, searchSessions } from "../db/store"
import { formatProviderHeaderLine } from "./providers"
import {
  formatEventDetailPlain,
  formatFileEditHeader,
  formatFileEditUnifiedDiff,
} from "./event-detail"
import {
  TIMELINE_CATEGORIES,
  availableTimelineCategories,
  categoryFilterKeys,
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

type GitFileTarget = {
  kind: "file"
  file: SessionFile
}

type GitCommitTarget = {
  kind: "commit"
  commit: NearbyCommit
}

type GitSelectionTarget = GitFileTarget | GitCommitTarget

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
  const headerProviders = new TextRenderable(renderer, {
    id: "header-providers",
    content: "",
    fg: theme.title,
    flexShrink: 0,
  })
  header.add(headerProviders)
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

  const configuredProviders = listConfiguredProviders()
  const allProjects = projects

  function initialProviderId(): string {
    if (configuredProviders.length === 0) return ""
    for (const provider of configuredProviders) {
      if (allProjects.some((project) => project.provider === provider.id)) {
        return provider.id
      }
    }
    return configuredProviders[0]!.id
  }

  let activeProviderId = initialProviderId()

  function buildProjectOptions(filteredProjects: Project[]): SelectOption[] {
    if (configuredProviders.length === 0) {
      return [
        {
          name: "(none configured)",
          description: "Add provider paths to .env and run ag-explorer index",
          value: null,
        },
      ]
    }

    if (filteredProjects.length === 0) {
      return [
        {
          name: "(none found)",
          description: "No indexed projects for this provider — run ag-explorer index",
          value: null,
        },
      ]
    }

    return filteredProjects.map((project) => ({
      name: project.name,
      description: `${project.sessionCount} session${project.sessionCount === 1 ? "" : "s"} · last ${formatConversationDate(project.lastSessionAt)}`,
      value: project.id,
    }))
  }

  function filteredProjectsForActiveProvider(): Project[] {
    if (!activeProviderId) return []
    return allProjects.filter((project) => project.provider === activeProviderId)
  }

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
    options: buildProjectOptions(filteredProjectsForActiveProvider()),
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
    height: 3,
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

  const gitBox = new BoxRenderable(renderer, {
    id: "git-box",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    visible: false,
  })

  const gitHeaderBox = new BoxRenderable(renderer, {
    id: "git-header-box",
    height: 2,
    flexShrink: 0,
    marginBottom: 1,
    paddingLeft: 1,
    backgroundColor: theme.panel,
  })

  const gitHeaderText = new TextRenderable(renderer, {
    id: "git-header-text",
    content: "",
    fg: theme.footerText,
  })
  gitHeaderBox.add(gitHeaderText)

  const gitNoteText = new TextRenderable(renderer, {
    id: "git-note-text",
    content: "",
    fg: theme.muted,
    marginBottom: 1,
    paddingLeft: 1,
  })

  const gitListsRow = new BoxRenderable(renderer, {
    id: "git-lists-row",
    flexDirection: "row",
    flexGrow: 1,
    flexShrink: 1,
    gap: 1,
  })

  const gitFilesBox = new BoxRenderable(renderer, {
    id: "git-files-box",
    flexGrow: 1,
    flexShrink: 1,
    border: true,
    borderColor: theme.border,
    focusedBorderColor: theme.borderFocus,
    title: " Session Files ",
    titleAlignment: "left",
    backgroundColor: theme.panel,
  })

  const gitFilesSelect = new SelectRenderable(renderer, {
    id: "git-files-select",
    width: "100%",
    height: "100%",
    options: [{ name: "No files in session", description: "", value: null }],
    ...selectColors,
    showDescription: true,
    wrapSelection: false,
    showScrollIndicator: true,
  })
  gitFilesBox.add(gitFilesSelect)

  const gitCommitsBox = new BoxRenderable(renderer, {
    id: "git-commits-box",
    flexGrow: 1,
    flexShrink: 1,
    border: true,
    borderColor: theme.border,
    focusedBorderColor: theme.borderFocus,
    title: " Nearby Commits ",
    titleAlignment: "left",
    backgroundColor: theme.panel,
  })

  const gitCommitsSelect = new SelectRenderable(renderer, {
    id: "git-commits-select",
    width: "100%",
    height: "100%",
    options: [{ name: "No nearby commits", description: "", value: null }],
    ...selectColors,
    showDescription: true,
    wrapSelection: false,
    showScrollIndicator: true,
  })
  gitCommitsBox.add(gitCommitsSelect)

  gitListsRow.add(gitFilesBox)
  gitListsRow.add(gitCommitsBox)
  gitBox.add(gitHeaderBox)
  gitBox.add(gitNoteText)
  gitBox.add(gitListsRow)
  timelinePane.add(gitBox)

  const intelligenceBox = new BoxRenderable(renderer, {
    id: "intelligence-box",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    visible: false,
  })

  const intelligenceHeaderBox = new BoxRenderable(renderer, {
    id: "intelligence-header-box",
    height: 2,
    flexShrink: 0,
    marginBottom: 1,
    paddingLeft: 1,
    backgroundColor: theme.panel,
  })

  const intelligenceHeaderText = new TextRenderable(renderer, {
    id: "intelligence-header-text",
    content: "",
    fg: theme.footerText,
  })
  intelligenceHeaderBox.add(intelligenceHeaderText)

  const intelligenceKnowledgeBox = new BoxRenderable(renderer, {
    id: "intelligence-knowledge-box",
    flexGrow: 1,
    flexShrink: 1,
    border: true,
    borderColor: theme.border,
    focusedBorderColor: theme.borderFocus,
    title: " Knowledge ",
    titleAlignment: "left",
    backgroundColor: theme.panel,
  })

  const intelligenceKnowledgeSelect = new SelectRenderable(renderer, {
    id: "intelligence-knowledge-select",
    width: "100%",
    height: "100%",
    options: [{ name: "No knowledge items", description: "", value: null }],
    ...selectColors,
    showDescription: true,
    wrapSelection: false,
    showScrollIndicator: true,
  })
  intelligenceKnowledgeBox.add(intelligenceKnowledgeSelect)
  intelligenceBox.add(intelligenceHeaderBox)
  intelligenceBox.add(intelligenceKnowledgeBox)
  timelinePane.add(intelligenceBox)

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
  const gitFocusables = [gitFilesSelect, gitCommitsSelect, detailScroll] as const
  const gitFocusBoxes = [gitFilesBox, gitCommitsBox, detailBox] as const
  const intelligenceFocusables = [intelligenceKnowledgeSelect, detailScroll] as const
  const intelligenceFocusBoxes = [intelligenceKnowledgeBox, detailBox] as const
  let focusIndex = 0
  let searchFocusIndex = 0
  let gitFocusIndex = 0
  let projectsExpanded = true

  let projectById = new Map(allProjects.map((project) => [project.id, project]))
  let sessionsById = new Map<number, Session>()
  let currentSession: AgentSession | null = null
  let visibleEvents: AgentEvent[] = []
  let activeCategory: TimelineCategory = "all"
  let timelineCategories: TimelineCategory[] = TIMELINE_CATEGORIES
  let timelineCategoryKeys = categoryFilterKeys(TIMELINE_CATEGORIES)
  let detailExpanded = true
  let searchMode = false
  let gitMode = false
  let intelligenceMode = false
  let sessionKnowledge: KnowledgeItem[] = []
  let gitContext: GitSessionContext | null = null
  let gitContextSessionId: number | null = null
  let gitContextLoading = false
  let statusResetTimer: ReturnType<typeof setTimeout> | null = null
  let loadGeneration = 0

  function defaultFooter(): string {
    return defaultFooterText(
      searchMode,
      gitMode,
      intelligenceMode,
      projectsExpanded,
      timelineCategories,
      configuredProviders.length > 1,
    )
  }

  const refreshProviderHeader = () => {
    headerProviders.content = formatProviderHeaderLine(activeProviderId, configuredProviders)
    headerProviders.fg = configuredProviders.length === 0 ? theme.muted : theme.title
  }

  const applyActiveProvider = async () => {
    refreshProviderHeader()
    const visibleProjects = filteredProjectsForActiveProvider()
    projectById = new Map(visibleProjects.map((project) => [project.id, project]))
    projectSelect.options = buildProjectOptions(visibleProjects)
    projectSelect.setSelectedIndex(0)
    footerText.content = defaultFooter()
    await loadSelectedProject()
  }

  const cycleProvider = (direction: 1 | -1) => {
    if (configuredProviders.length <= 1) return

    const currentIndex = configuredProviders.findIndex((provider) => provider.id === activeProviderId)
    const startIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (startIndex + direction + configuredProviders.length) % configuredProviders.length
    activeProviderId = configuredProviders[nextIndex]!.id
    void applyActiveProvider()
    const label = configuredProviders[nextIndex]!.label
    flashFooter(`Provider: ${label}`)
  }

  const updateTimelineCapabilities = (source?: string) => {
    const capabilities = source ? getProvider(source).capabilities : undefined
    timelineCategories = availableTimelineCategories(capabilities)
    timelineCategoryKeys = categoryFilterKeys(timelineCategories)
    if (!timelineCategories.includes(activeCategory)) {
      activeCategory = "all"
    }
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
      const visibleCount = filteredProjectsForActiveProvider().length
      headerProject.content =
        configuredProviders.length === 0
          ? "No providers configured in .env"
          : visibleCount === 0
            ? "No projects indexed for this provider"
            : "No project selected"
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
    searchBox.visible = false
    gitBox.visible = false
    intelligenceBox.visible = false
    if (visible) {
      detailBox.title = " Event Detail "
    }
  }

  const setSearchPaneVisible = (visible: boolean) => {
    filterBox.visible = !visible
    categoryFilterBox.visible = !visible
    summaryBox.visible = !visible
    timelineListBox.visible = !visible
    detailBox.visible = !visible
    searchBox.visible = visible
    gitBox.visible = false
    intelligenceBox.visible = false
  }

  const setGitPaneVisible = (visible: boolean) => {
    filterBox.visible = !visible
    categoryFilterBox.visible = !visible
    summaryBox.visible = !visible
    timelineListBox.visible = !visible
    searchBox.visible = false
    gitBox.visible = visible
    intelligenceBox.visible = false
    detailBox.visible = true
    detailBox.title = visible ? " Git Detail " : " Event Detail "
  }

  const setIntelligencePaneVisible = (visible: boolean) => {
    filterBox.visible = !visible
    categoryFilterBox.visible = !visible
    summaryBox.visible = !visible
    timelineListBox.visible = !visible
    searchBox.visible = false
    gitBox.visible = false
    intelligenceBox.visible = visible
    detailBox.visible = true
    detailBox.title = visible ? " Intelligence Detail " : " Event Detail "
  }

  const setSearchFocus = (index: number) => {
    searchFocusIndex = (index + searchFocusables.length) % searchFocusables.length
    searchFocusables.forEach((el) => el.blur())
    searchFocusBoxes.forEach((box) => box.blur())
    searchFocusables[searchFocusIndex].focus()
    searchFocusBoxes[searchFocusIndex].focus()
  }

  const setGitFocus = (index: number) => {
    gitFocusIndex = (index + gitFocusables.length) % gitFocusables.length
    gitFocusables.forEach((el) => el.blur())
    gitFocusBoxes.forEach((box) => box.blur())
    gitFocusables[gitFocusIndex].focus()
    gitFocusBoxes[gitFocusIndex].focus()
  }

  let intelligenceFocusIndex = 0

  const setIntelligenceFocus = (index: number) => {
    intelligenceFocusIndex =
      (index + intelligenceFocusables.length) % intelligenceFocusables.length
    intelligenceFocusables.forEach((el) => el.blur())
    intelligenceFocusBoxes.forEach((box) => box.blur())
    intelligenceFocusables[intelligenceFocusIndex].focus()
    intelligenceFocusBoxes[intelligenceFocusIndex].focus()
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

    if (gitMode) {
      setGitFocus(index)
      return
    }

    if (intelligenceMode) {
      setIntelligenceFocus(index)
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
    summaryText.content =
      formatSessionSummaryLine(sessionSummary(currentSession.events)) +
      formatCompactOutcome(sessionOutcome(currentSession))
  }

  const refreshSessionKnowledge = () => {
    if (!currentSession) {
      sessionKnowledge = []
      return
    }
    sessionKnowledge = listKnowledgeForSession(db, currentSession.id)
  }

  const refreshIntelligenceLists = () => {
    if (!currentSession) {
      intelligenceHeaderText.content = "No session loaded"
      intelligenceKnowledgeSelect.options = [
        { name: "No knowledge items", description: "", value: null },
      ]
      return
    }

    const outcome = sessionOutcome(currentSession)
    intelligenceHeaderText.content = formatSessionOutcome(outcome).replace(/\n/g, "  ·  ")
    intelligenceKnowledgeSelect.options =
      sessionKnowledge.length === 0
        ? [{ name: "No knowledge items — press k on timeline to bookmark", description: "", value: null }]
        : sessionKnowledge.map((item) => ({
            name: `[${item.type}] ${item.title}`,
            description: item.source,
            value: item.id,
          }))
  }

  const renderIntelligenceDetail = (knowledgeId: number | null) => {
    detailEditHeader.visible = false
    detailDiff.visible = false
    detailText.visible = true

    if (!currentSession) {
      detailText.content = "Select a session"
      detailText.fg = theme.muted
      return
    }

    if (knowledgeId !== null) {
      const item = sessionKnowledge.find((entry) => entry.id === knowledgeId)
      if (item) {
        detailText.content = formatKnowledgeItemPlain(item)
        detailText.fg = theme.text
        detailScroll.scrollTop = 0
        return
      }
    }

    detailText.content = formatSessionIntelligenceReport(currentSession)
    detailText.fg = theme.text
    detailScroll.scrollTop = 0
  }

  const updateCategoryFilterLine = () => {
    categoryFilterText.content = `Filter: ${formatCategoryFilterLine(activeCategory, timelineCategories)}`
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

    const groups = searchSessions(
      db,
      query,
      activeProviderId ? { provider: activeProviderId } : undefined,
    )
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

  const renderGitDetailText = (text: string) => {
    detailEditHeader.visible = false
    detailDiff.visible = false
    detailText.visible = true
    detailText.content = text
    detailText.fg = theme.text
    detailScroll.scrollTop = 0
  }

  const renderGitDetailPatch = (header: string, patch: string) => {
    detailText.visible = false
    detailEditHeader.visible = true
    detailDiff.visible = true
    detailEditHeader.content = header
    detailEditHeader.fg = theme.text
    detailDiff.diff = patch
    detailScroll.scrollTop = 0
  }

  const refreshGitLists = (context: GitSessionContext) => {
    gitHeaderText.content = formatGitHeader(context)
    gitNoteText.content = context.heuristicNote

    gitFilesSelect.options =
      currentSession && currentSession.files.length > 0
        ? currentSession.files.map((file) => ({
            name: gitFileOptionLabel(file),
            description: gitFileOptionDescription(file),
            value: { kind: "file", file } satisfies GitFileTarget,
          }))
        : [{ name: "No files in session", description: "", value: null }]

    gitCommitsSelect.options =
      context.nearbyCommits.length > 0
        ? context.nearbyCommits.map((commit) => ({
            name: gitCommitOptionLabel(commit),
            description: gitCommitOptionDescription(commit),
            value: { kind: "commit", commit } satisfies GitCommitTarget,
          }))
        : [{ name: "No nearby commits in window", description: "", value: null }]
  }

  const showGitSelectionDetail = async (target: GitSelectionTarget) => {
    if (!currentSession || !gitContext) return

    if (target.kind === "commit") {
      renderGitDetailText(formatNearbyCommitDetail(target.commit))
      setGitFocus(2)
      return
    }

    renderGitDetailText("Loading Git diff…")
    setGitFocus(2)

    try {
      const loaded = await loadGitFilePatch(target.file, gitContext, currentSession.events)
      if (loaded.patch) {
        renderGitDetailPatch(loaded.header, loaded.patch)
      } else {
        renderGitDetailText(loaded.fallbackText ?? loaded.header)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      renderGitDetailText(`Failed to load Git diff:\n${message}`)
    }
  }

  const ensureGitContext = async (): Promise<GitSessionContext | null> => {
    if (!currentSession) return null
    if (gitContext && gitContextSessionId === currentSession.id) return gitContext

    gitContextLoading = true
    gitHeaderText.content = "Loading Git context…"
    gitNoteText.content = ""
    gitFilesSelect.options = [{ name: "Loading…", description: "", value: null }]
    gitCommitsSelect.options = [{ name: "Loading…", description: "", value: null }]

    try {
      const context = await resolveGitSessionContext(
        currentSession,
        currentSession.project.sourcePath,
      )
      gitContext = context
      gitContextSessionId = currentSession.id
      refreshGitLists(context)
      return context
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      gitHeaderText.content = "Git context failed"
      gitNoteText.content = message
      return null
    } finally {
      gitContextLoading = false
    }
  }

  const exitGitMode = () => {
    gitMode = false
    setTimelineVisible(true)
    footerText.content = defaultFooter()
    setFocus(focusIndex)
    const selected = selectedTimelineEvent()
    renderDetail(selected, detailExpanded)
  }

  const enterGitMode = async () => {
    if (!currentSession) {
      flashFooter("Select a session first", false)
      return
    }

    intelligenceMode = false
    gitMode = true
    setGitPaneVisible(true)
    footerText.content = gitFooterText()
    setGitFocus(0)
    renderGitDetailText("Select a session file or nearby commit")

    await ensureGitContext()
  }

  const exitIntelligenceMode = () => {
    intelligenceMode = false
    setTimelineVisible(true)
    footerText.content = defaultFooter()
    setFocus(focusIndex)
    const selected = selectedTimelineEvent()
    renderDetail(selected, detailExpanded)
  }

  const enterIntelligenceMode = () => {
    if (!currentSession) {
      flashFooter("Select a session first", false)
      return
    }

    gitMode = false
    intelligenceMode = true
    refreshSessionKnowledge()
    refreshIntelligenceLists()
    setIntelligencePaneVisible(true)
    footerText.content = intelligenceFooterText()
    setIntelligenceFocus(0)
    renderIntelligenceDetail(null)
  }

  const bookmarkSelectedEvent = () => {
    if (!currentSession) {
      flashFooter("Select a session first", false)
      return
    }

    const event = selectedTimelineEvent()
    if (!event) {
      flashFooter("Select a timeline event to bookmark", false)
      return
    }

    const draft = knowledgeFromEvent(event, currentSession.sourcePath, currentSession.id)
    const item = insertKnowledge(db, draft)
    sessionKnowledge = [item, ...sessionKnowledge.filter((entry) => entry.id !== item.id)]
    if (intelligenceMode) refreshIntelligenceLists()
    flashFooter(`Saved knowledge: ${item.type}`)
  }

  const exitSearchMode = () => {
    searchMode = false
    setTimelineVisible(true)
    footerText.content = defaultFooter()
    setFocus(focusIndex)
  }

  const enterSearchMode = () => {
    searchMode = true
    setSearchPaneVisible(true)
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
      updateTimelineCapabilities()
      refreshTimeline()
      return
    }

    const session = sessionsById.get(sessionId)
    if (!session) {
      currentSession = null
      updateTimelineCapabilities()
      refreshTimeline()
      return
    }

    timelineSelect.options = [{ name: "Loading timeline…", description: "", value: null }]
    detailText.content = "Loading timeline…"
    detailText.fg = theme.muted
    activeCategory = "all"
    filterInput.value = ""
    updateTimelineCapabilities(session.sourceProvider)

    try {
      const agentSession = await getAgentSession(db, sessionId)
      if (generation !== loadGeneration) return
      if (!agentSession) {
        currentSession = null
        updateTimelineCapabilities()
        timelineSelect.options = [{ name: "Session not found", description: "", value: null }]
        detailText.content = "Session not found"
        detailText.fg = theme.userLabel
        return
      }
      currentSession = agentSession
      updateTimelineCapabilities(agentSession.source)
      gitContext = null
      gitContextSessionId = null
      applyAutoKnowledge(db, agentSession)
      refreshSessionKnowledge()
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

  intelligenceKnowledgeSelect.on(SelectRenderableEvents.SELECTION_CHANGED, () => {
    const selected = intelligenceKnowledgeSelect.getSelectedOption()
    const value = selected?.value
    renderIntelligenceDetail(typeof value === "number" ? value : null)
  })

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "tab") {
      if (searchMode) {
        setSearchFocus(searchFocusIndex + (key.shift ? -1 : 1))
      } else if (gitMode) {
        setGitFocus(gitFocusIndex + (key.shift ? -1 : 1))
      } else if (intelligenceMode) {
        setIntelligenceFocus(intelligenceFocusIndex + (key.shift ? -1 : 1))
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

    if (key.name === "escape" && gitMode) {
      exitGitMode()
      key.preventDefault()
      return
    }

    if (key.name === "escape" && intelligenceMode) {
      exitIntelligenceMode()
      key.preventDefault()
      return
    }

    if (key.name === "/" && !searchMode && !gitMode && !intelligenceMode && focusedElement() !== filterInput) {
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

    if (gitMode && key.name === "return" && !gitContextLoading) {
      const activeSelect = gitFocusables[gitFocusIndex]
      const selected =
        activeSelect === gitFilesSelect
          ? gitFilesSelect.getSelectedOption()
          : activeSelect === gitCommitsSelect
            ? gitCommitsSelect.getSelectedOption()
            : null
      const value = selected?.value
      if (value && typeof value === "object" && "kind" in value) {
        void showGitSelectionDetail(value as GitSelectionTarget)
      }
      key.preventDefault()
      return
    }

    if (
      key.ctrl &&
      key.name === "g" &&
      !key.meta &&
      !searchMode &&
      !gitMode &&
      !intelligenceMode
    ) {
      void enterGitMode()
      key.preventDefault()
      return
    }

    if (
      key.ctrl &&
      key.name === "i" &&
      !key.meta &&
      !searchMode &&
      !gitMode &&
      !intelligenceMode
    ) {
      enterIntelligenceMode()
      key.preventDefault()
      return
    }

    const projectFocused =
      !searchMode && !gitMode && !intelligenceMode && focusedElement() === projectSelect
    if (key.name === "return" && projectFocused && selectedProject()) {
      collapseProjectsPane({ focusSessions: true })
      key.preventDefault()
      return
    }

    const timelineFocused =
      !searchMode && !gitMode && !intelligenceMode && focusedElement() === timelineSelect
    if (key.name === "return" && timelineFocused) {
      focusDetail()
      key.preventDefault()
      return
    }

    const filterFocused = focusedElement() === filterInput
    const searchInputFocused = searchMode && searchFocusables[searchFocusIndex] === searchInput
    const typingFocused = filterFocused || searchInputFocused

    if (!searchMode && !gitMode && !intelligenceMode && key.ctrl && key.name === "[" && !key.meta) {
      toggleProjectsPane()
      key.preventDefault()
      return
    }

    if (
      !searchMode &&
      !gitMode &&
      !intelligenceMode &&
      !typingFocused &&
      key.name in timelineCategoryKeys
    ) {
      setCategory(timelineCategoryKeys[key.name]!)
      key.preventDefault()
      return
    }

    if (!searchMode && !gitMode && !intelligenceMode && key.ctrl && key.name === "]" && !key.meta) {
      jumpToError(1)
      key.preventDefault()
      return
    }

    if (
      !searchMode &&
      !gitMode &&
      !intelligenceMode &&
      !typingFocused &&
      key.name === "k"
    ) {
      bookmarkSelectedEvent()
      key.preventDefault()
      return
    }

    if (
      !searchMode &&
      !gitMode &&
      !intelligenceMode &&
      !typingFocused &&
      key.ctrl &&
      key.name === "p" &&
      !key.meta
    ) {
      cycleProvider(1)
      key.preventDefault()
      return
    }

    if (!searchMode && !gitMode && !intelligenceMode && key.ctrl && key.name === "y" && !key.meta) {
      void copyCurrent()
      key.preventDefault()
    }
  })

  refreshProviderHeader()
  setFocus(0)
  await applyActiveProvider()
}

function searchFooterText(): string {
  return "Enter search  ·  Enter open  ·  Esc back  ·  Tab focus"
}

function gitFooterText(): string {
  return "Enter inspect  ·  Tab focus  ·  Esc back to timeline"
}

function intelligenceFooterText(): string {
  return "Enter inspect  ·  Tab focus  ·  Esc back to timeline"
}

function defaultFooterText(
  searchMode = false,
  gitMode = false,
  intelligenceMode = false,
  projectsExpanded = true,
  categories: TimelineCategory[] = TIMELINE_CATEGORIES,
  multipleProviders = false,
): string {
  if (searchMode) return searchFooterText()
  if (gitMode) return gitFooterText()
  if (intelligenceMode) return intelligenceFooterText()
  const projectsHint = projectsExpanded ? "Ctrl+[ hide projects" : "Ctrl+[ show projects"
  const maxFilterKey = Math.max(0, categories.length - 1)
  const providerHint = multipleProviders ? "  ·  Ctrl+P provider" : ""
  return `↑/↓ select  ·  0-${maxFilterKey} filter  ·  Ctrl+] errors  ·  k save knowledge  ·  Ctrl+I intelligence  ·  / search  ·  Ctrl+G git${providerHint}  ·  Enter focus detail  ·  ${projectsHint}  ·  Ctrl+Y copy  ·  Ctrl+C quit`
}
