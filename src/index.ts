import {
  BoxRenderable,
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
import { copyTextToClipboard } from "./clipboard"
import { loadEnvFile } from "./env"
import {
  formatConversationDate,
  formatMessages,
  formatMessagesPlain,
  loadChatDetails,
  loadChats,
  loadWorkspaces,
  resolveChatHistoryDir,
  type ChatMessage,
  type ChatSummary,
  type WorkspaceSummary,
} from "./history"
import { theme } from "./theme"

async function main() {
  loadEnvFile()

  const historyDir = resolveChatHistoryDir()
  const workspaces = await loadWorkspaces(historyDir)

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
  })

  renderer.setBackgroundColor(theme.bg)
  await buildUi(renderer, historyDir, workspaces)
  renderer.start()
}

async function buildUi(
  renderer: CliRenderer,
  historyDir: string,
  workspaces: WorkspaceSummary[],
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
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  })
  header.add(
    new TextRenderable(renderer, {
      id: "header-text",
      content: "CHViewer - View Cursor Chat History",
      fg: theme.title,
    }),
  )

  const body = new BoxRenderable(renderer, {
    id: "body",
    flexDirection: "row",
    flexGrow: 1,
    flexShrink: 1,
    width: "100%",
  })

  const workspacePane = new BoxRenderable(renderer, {
    id: "workspace-pane",
    width: 44,
    border: true,
    borderColor: theme.border,
    focusedBorderColor: theme.borderFocus,
    title: " Workspaces ",
    titleAlignment: "left",
    flexShrink: 0,
    backgroundColor: theme.panel,
  })

  const workspaceOptions: SelectOption[] =
    workspaces.length === 0
      ? [
          {
            name: "(none found)",
            description: "No agent-transcripts under history dir",
            value: null,
          },
        ]
      : workspaces.map((ws) => ({
          name: ws.name,
          description: `${ws.chatCount} chat${ws.chatCount === 1 ? "" : "s"} · last ${formatConversationDate(ws.lastConversationAt)}`,
          value: ws.id,
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

  const workspaceSelect = new SelectRenderable(renderer, {
    id: "workspace-select",
    width: "100%",
    height: "100%",
    options: workspaceOptions,
    ...selectColors,
    showDescription: true,
    wrapSelection: true,
    showScrollIndicator: true,
  })
  workspacePane.add(workspaceSelect)

  const chatPane = new BoxRenderable(renderer, {
    id: "chat-pane",
    width: 42,
    border: true,
    borderColor: theme.border,
    focusedBorderColor: theme.borderFocus,
    title: " Chats ",
    titleAlignment: "left",
    flexShrink: 0,
    backgroundColor: theme.panel,
  })

  const chatSelect = new SelectRenderable(renderer, {
    id: "chat-select",
    width: "100%",
    height: "100%",
    options: [{ name: "Select a workspace", description: "", value: null }],
    ...selectColors,
    showDescription: true,
    wrapSelection: true,
    showScrollIndicator: true,
  })
  chatPane.add(chatSelect)

  const mainPane = new BoxRenderable(renderer, {
    id: "main-pane",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    border: true,
    borderColor: theme.border,
    focusedBorderColor: theme.borderFocus,
    title: " Transcript ",
    titleAlignment: "left",
    backgroundColor: theme.panel,
  })

  const transcriptScroll = new ScrollBoxRenderable(renderer, {
    id: "transcript-scroll",
    flexGrow: 1,
    flexShrink: 1,
    width: "100%",
    scrollX: false,
    scrollY: true,
    rootOptions: { backgroundColor: theme.panel, border: false },
    wrapperOptions: { backgroundColor: theme.panel, border: false },
    viewportOptions: { backgroundColor: theme.panel, border: false },
    contentOptions: { backgroundColor: theme.panel, border: false },
  })

  const messagesText = new TextRenderable(renderer, {
    id: "messages-text",
    content: "Select a chat to view its transcript.",
    fg: theme.muted,
    selectable: true,
  })
  transcriptScroll.add(messagesText)

  const filterBox = new BoxRenderable(renderer, {
    id: "filter-box",
    height: 3,
    border: true,
    borderColor: theme.border,
    focusedBorderColor: theme.borderFocus,
    flexShrink: 0,
    marginTop: 1,
  })

  const filterInput = new InputRenderable(renderer, {
    id: "filter-input",
    width: "100%",
    placeholder: "Filter transcript...",
    backgroundColor: theme.inputBg,
    focusedBackgroundColor: theme.inputFocusBg,
    textColor: theme.textBright,
    focusedTextColor: theme.textBright,
    placeholderColor: theme.placeholder,
    cursorColor: theme.cursor,
  })
  filterBox.add(filterInput)
  mainPane.add(transcriptScroll)
  mainPane.add(filterBox)

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
    content: `↑/↓ select  ·  Tab focus  ·  y copy chat  ·  Ctrl+C quit  ·  ${historyDir}`,
    fg: theme.footerText,
  })
  footer.add(footerText)

  body.add(workspacePane)
  body.add(chatPane)
  body.add(mainPane)
  root.add(header)
  root.add(body)
  root.add(footer)
  renderer.root.add(root)

  const focusables = [workspaceSelect, chatSelect, filterInput, transcriptScroll] as const
  const focusBoxes = [workspacePane, chatPane, filterBox, mainPane] as const
  let focusIndex = 0

  const workspaceById = new Map(workspaces.map((ws) => [ws.id, ws]))
  let chatsById = new Map<string, ChatSummary>()
  let currentMessages: ChatMessage[] = []
  let currentPlanPaths: string[] = []
  let statusResetTimer: ReturnType<typeof setTimeout> | null = null
  let loadGeneration = 0

  const defaultFooter =
    `↑/↓ select  ·  Tab focus  ·  y copy chat  ·  Ctrl+C quit  ·  ${historyDir}`

  const flashFooter = (message: string, ok = true) => {
    footerText.content = message
    footerText.fg = ok ? theme.agentLabel : theme.userLabel
    if (statusResetTimer) clearTimeout(statusResetTimer)
    statusResetTimer = setTimeout(() => {
      footerText.content = defaultFooter
      footerText.fg = theme.footerText
    }, 2200)
  }

  const setFocus = (index: number) => {
    focusIndex = (index + focusables.length) % focusables.length
    focusables.forEach((el) => el.blur())
    focusBoxes.forEach((box) => box.blur())
    focusables[focusIndex].focus()
    focusBoxes[focusIndex].focus()
  }

  const renderTranscript = () => {
    const selected = chatSelect.getSelectedOption()
    const title = selected?.name ?? "Transcript"
    messagesText.content = formatMessages(
      currentMessages,
      filterInput.value,
      title,
      currentPlanPaths,
    )
    transcriptScroll.scrollTop = 0
  }

  const copySelectedChat = async () => {
    const selected = chatSelect.getSelectedOption()
    const chatId = selected?.value
    if (!chatId || typeof chatId !== "string" || currentMessages.length === 0) {
      flashFooter("Nothing to copy — select a chat first", false)
      return
    }

    const title = selected?.name ?? "Transcript"
    const plain = formatMessagesPlain(currentMessages, title, currentPlanPaths)
    try {
      await copyTextToClipboard(plain, renderer)
      flashFooter(`Copied chat to clipboard (${currentMessages.length} messages)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      flashFooter(`Copy failed: ${message}`, false)
    }
  }

  const setChatOptions = (chats: ChatSummary[], emptyLabel: string) => {
    chatsById = new Map(chats.map((chat) => [chat.id, chat]))
    chatSelect.options =
      chats.length === 0
        ? [{ name: emptyLabel, description: "", value: null }]
        : chats.map((chat) => ({
            name: chat.title,
            description: formatConversationDate(chat.mtimeMs),
            value: chat.id,
          }))
    chatSelect.setSelectedIndex(0)
  }

  const loadSelectedChat = async () => {
    const generation = ++loadGeneration
    const selected = chatSelect.getSelectedOption()
    const chatId = selected?.value
    if (!chatId || typeof chatId !== "string") {
      currentMessages = []
      currentPlanPaths = []
      messagesText.content = "Select a chat to view its transcript."
      messagesText.fg = theme.muted
      return
    }

    const chat = chatsById.get(chatId)
    if (!chat) {
      currentMessages = []
      currentPlanPaths = []
      messagesText.content = "Chat not found."
      messagesText.fg = theme.muted
      return
    }

    messagesText.content = "Loading transcript…"
    messagesText.fg = theme.muted
    try {
      const details = await loadChatDetails(chat.path)
      if (generation !== loadGeneration) return
      currentMessages = details.messages
      currentPlanPaths = details.planPaths
      messagesText.fg = theme.text
      renderTranscript()
    } catch (error) {
      if (generation !== loadGeneration) return
      currentMessages = []
      currentPlanPaths = []
      const message = error instanceof Error ? error.message : String(error)
      messagesText.content = `Failed to load chat:\n${message}`
      messagesText.fg = theme.userLabel
    }
  }

  const loadSelectedWorkspace = async () => {
    const generation = ++loadGeneration
    const selected = workspaceSelect.getSelectedOption()
    const workspaceId = selected?.value
    if (!workspaceId || typeof workspaceId !== "string") {
      setChatOptions([], "No workspace selected")
      currentMessages = []
      currentPlanPaths = []
      messagesText.content = "No workspaces with chat history found."
      messagesText.fg = theme.muted
      return
    }

    const workspace = workspaceById.get(workspaceId)
    if (!workspace) {
      setChatOptions([], "Workspace missing")
      return
    }

    chatSelect.options = [{ name: "Loading chats…", description: "", value: null }]
    messagesText.content = "Loading chats…"
    messagesText.fg = theme.muted

    try {
      const chats = await loadChats(workspace)
      if (generation !== loadGeneration) return
      setChatOptions(chats, "No chats in workspace")
      await loadSelectedChat()
    } catch (error) {
      if (generation !== loadGeneration) return
      setChatOptions([], "Failed to load chats")
      const message = error instanceof Error ? error.message : String(error)
      messagesText.content = `Failed to load chats:\n${message}`
      messagesText.fg = theme.userLabel
    }
  }

  workspaceSelect.on(SelectRenderableEvents.SELECTION_CHANGED, () => {
    void loadSelectedWorkspace()
  })
  chatSelect.on(SelectRenderableEvents.SELECTION_CHANGED, () => {
    void loadSelectedChat()
  })
  filterInput.on(InputRenderableEvents.INPUT, renderTranscript)

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "tab") {
      setFocus(focusIndex + (key.shift ? -1 : 1))
      key.preventDefault()
      return
    }

    const filterFocused = focusables[focusIndex] === filterInput
    const copyRequested =
      (key.name === "y" && !filterFocused && !key.ctrl && !key.meta) ||
      (key.name === "y" && key.ctrl)
    if (copyRequested) {
      void copySelectedChat()
      key.preventDefault()
    }
  })

  setFocus(0)
  await loadSelectedWorkspace()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
