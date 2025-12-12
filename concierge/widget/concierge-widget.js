/**
 * Flypost Concierge Widget
 * Embeddable chat widget with brokerage-specific branding support
 * 
 * Configuration via window.FLYPOST_CONFIG:
 * {
 *   apiBase: 'https://api.goflypost.com',
 *   brokerageId: 'vista-sir',
 *   branding: {
 *     name: 'Vista Sotheby\'s International Realty',
 *     primaryColor: '#1a1a1a',
 *     accentColor: '#c9a962',
 *     logo: 'https://assets.goflypost.com/logos/vista-sir.png',
 *     headerText: 'Discover Vista Sotheby\'s Open Houses'
 *   }
 * }
 */

(function() {
  'use strict';

  // Default configuration
  const defaultConfig = {
    apiBase: 'https://api.goflypost.com',
    brokerageId: null,
    branding: {
      name: 'Flypost',
      primaryColor: '#667eea',
      accentColor: '#764ba2',
      logo: null,
      headerText: 'Discover Local Events'
    }
  };

  // Merge user config with defaults
  const config = {
    ...defaultConfig,
    ...(window.FLYPOST_CONFIG || {}),
    branding: {
      ...defaultConfig.branding,
      ...(window.FLYPOST_CONFIG?.branding || {})
    }
  };

  // Validate configuration
  if (!config.apiBase) {
    console.error('Flypost Concierge: apiBase is required in FLYPOST_CONFIG');
    return;
  }

  // Validate apiBase URL format and enforce HTTPS in production
  try {
    const apiUrl = new URL(config.apiBase);
    // Enforce HTTPS unless explicitly localhost for development
    if (apiUrl.protocol !== 'https:' && apiUrl.hostname !== 'localhost' && apiUrl.hostname !== '127.0.0.1') {
      console.error('Flypost Concierge: apiBase must use HTTPS in production');
      return;
    }
  } catch (e) {
    console.error('Flypost Concierge: Invalid apiBase URL');
    return;
  }

  // Validate logo URL if provided
  if (config.branding.logo) {
    try {
      const logoUrl = new URL(config.branding.logo);
      // Only allow http(s) protocols for logo
      if (logoUrl.protocol !== 'http:' && logoUrl.protocol !== 'https:') {
        console.error('Flypost Concierge: Logo URL must use HTTP or HTTPS protocol');
        config.branding.logo = null;
      }
    } catch (e) {
      console.error('Flypost Concierge: Invalid logo URL');
      config.branding.logo = null;
    }
  }

  // Constants
  const MAX_CONVERSATION_HISTORY = 10; // Limit history to control storage and token usage

  // State
  let userLocation = null;
  let isProcessing = false;
  let isSending = false; // Prevent double sends from keydown + submit
  let messagesContainer = null;
  let userInput = null;
  let sendButton = null;
  let locationStatus = null;
  let conversationHistory = [];

  // LocalStorage key for conversation memory (scoped to brokerageId)
  const STORAGE_KEY = config.brokerageId 
    ? `flypost_conversation_${config.brokerageId}`
    : 'flypost_conversation_default';

  /**
   * Validate conversation history message structure
   */
  function isValidMessage(msg) {
    return (
      msg &&
      typeof msg === 'object' &&
      typeof msg.role === 'string' &&
      (msg.role === 'user' || msg.role === 'assistant') &&
      typeof msg.content === 'string' &&
      msg.content.length > 0 &&
      msg.content.length < 50000 // Reasonable size limit
    );
  }

  /**
   * Load conversation history from localStorage
   * Validates data structure to prevent injection attacks
   */
  function loadConversationHistory() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        
        // Validate that parsed data is an array
        if (!Array.isArray(parsed)) {
          console.warn('Invalid conversation history format: not an array');
          conversationHistory = [];
          return;
        }
        
        // Validate and sanitize each message
        const validatedHistory = parsed.filter(msg => {
          if (!isValidMessage(msg)) {
            console.warn('Invalid message in history, skipping:', msg);
            return false;
          }
          return true;
        }).map(msg => ({
          role: msg.role,
          content: String(msg.content).substring(0, 50000) // Enforce size limit
        }));
        
        conversationHistory = validatedHistory;
        console.log(`📝 Loaded ${conversationHistory.length} valid messages from memory`);
      }
    } catch (error) {
      console.warn('Failed to load conversation history:', error);
      conversationHistory = [];
    }
  }

  /**
   * Save conversation history to localStorage
   */
  function saveConversationHistory() {
    try {
      // Limit to most recent messages to control storage size
      const trimmedHistory = conversationHistory.slice(-MAX_CONVERSATION_HISTORY);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedHistory));
    } catch (error) {
      console.warn('Failed to save conversation history:', error);
    }
  }

  /**
   * Clear conversation history
   */
  function clearConversationHistory() {
    conversationHistory = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear conversation history:', error);
    }
  }

  /**
   * Initialize marked.js for Markdown rendering
   */
  function initializeMarked() {
    // Check if marked is already loaded
    if (typeof marked !== 'undefined') {
      // Configure marked for safe rendering with HTML sanitization
      marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false,
        // Disable raw HTML to prevent XSS attacks
        // This ensures no <script>, <img onerror>, or other dangerous HTML can be injected
        renderer: new marked.Renderer()
      });
      
      // Override renderer to strip potentially dangerous HTML
      const renderer = marked.defaults.renderer;
      const originalHtml = renderer.html;
      renderer.html = function(html) {
        // Block all raw HTML by returning empty string
        return '';
      };
      
      return true;
    }
    return false;
  }

  /**
   * Render Markdown to HTML safely
   * Sanitizes output to prevent XSS attacks by stripping raw HTML
   * Includes auto-link detection for plain URLs
   */
  function renderMarkdown(text) {
    if (typeof marked !== 'undefined') {
      try {
        // Parse Markdown with HTML disabled and GFM for auto-linking
        const parsed = marked.parse(text, { 
          breaks: true,
          gfm: true, // GitHub Flavored Markdown - enables auto-linking
          headerIds: false,
          mangle: false,
          // Enable auto-linking of URLs
          pedantic: false
        });
        // Additional sanitization: remove any remaining script tags or event handlers
        return sanitizeHtml(parsed);
      } catch (error) {
        console.warn('Markdown parsing error:', error);
        // Fallback with auto-link detection
        return linkifyText(escapeHtml(text)).replace(/\n/g, '<br>');
      }
    }
    // Fallback: simple text with line breaks and auto-linking
    return linkifyText(escapeHtml(text)).replace(/\n/g, '<br>');
  }

  /**
   * Sanitize HTML to prevent XSS attacks
   * Removes script tags, event handlers, and other dangerous elements
   */
  function sanitizeHtml(html) {
    // Create a temporary div to parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Remove all script tags
    const scripts = temp.querySelectorAll('script');
    scripts.forEach(script => script.remove());
    
    // Remove all elements with event handlers
    const allElements = temp.querySelectorAll('*');
    allElements.forEach(el => {
      // Remove all on* event attributes
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
      });
      
      // Remove dangerous src attributes from img, iframe, etc.
      if (el.tagName === 'IMG' || el.tagName === 'IFRAME' || el.tagName === 'EMBED' || el.tagName === 'OBJECT') {
        const src = el.getAttribute('src');
        if (src && !src.startsWith('http://') && !src.startsWith('https://')) {
          el.removeAttribute('src');
        }
      }
    });
    
    return temp.innerHTML;
  }

  /**
   * Create widget HTML structure
   */
  function createWidget() {
    const container = document.getElementById('flypost-concierge-container');
    if (!container) {
      console.error('Flypost Concierge: Container element #flypost-concierge-container not found');
      return;
    }

    const widgetHTML = `
      <div class="flypost-concierge-widget" id="flypost-widget">
        <div class="flypost-concierge-header">
          ${config.branding.logo ? `<img src="${escapeHtml(config.branding.logo)}" alt="${escapeHtml(config.branding.name)}" class="flypost-logo" />` : ''}
          <h2>${escapeHtml(config.branding.headerText)}</h2>
          <p>${escapeHtml(config.branding.name)}</p>
          <button id="flypost-clear-history" class="flypost-clear-history-button" title="Clear conversation history">🗑️ Clear History</button>
        </div>
        
        <div id="flypost-location-status" class="flypost-location-status">
          📍 Getting your location...
        </div>
        
        <div id="flypost-messages" class="flypost-concierge-messages">
          <div class="flypost-message system">
            Welcome! Ask me about events, open houses, or activities near you.
          </div>
        </div>
        
        <div class="flypost-concierge-input">
          <input 
            type="text" 
            id="flypost-user-input" 
            placeholder="What events are happening near me?"
            disabled
          />
          <button id="flypost-send-button" disabled>Send</button>
        </div>
      </div>
    `;

    container.innerHTML = widgetHTML;
    
    // Cache DOM elements
    messagesContainer = document.getElementById('flypost-messages');
    userInput = document.getElementById('flypost-user-input');
    sendButton = document.getElementById('flypost-send-button');
    locationStatus = document.getElementById('flypost-location-status');

    // Apply branding
    applyBranding();

    // Setup event listeners
    setupEventListeners();

    // Initialize Markdown rendering
    initializeMarked();

    // Load conversation history from localStorage
    loadConversationHistory();

    // Get user location
    getUserLocation();
  }

  /**
   * Apply brokerage-specific branding
   */
  function applyBranding() {
    const widget = document.getElementById('flypost-widget');
    if (!widget) return;

    const header = widget.querySelector('.flypost-concierge-header');
    const sendBtn = widget.querySelector('#flypost-send-button');
    const userInputEl = widget.querySelector('#flypost-user-input');

    if (header) {
      // Apply gradient from primary to accent color
      header.style.background = `linear-gradient(135deg, ${config.branding.primaryColor} 0%, ${config.branding.accentColor} 100%)`;
    }

    if (sendBtn) {
      sendBtn.style.background = config.branding.primaryColor;
    }

    if (userInputEl) {
      userInputEl.addEventListener('focus', function() {
        this.style.borderColor = config.branding.primaryColor;
      });
      userInputEl.addEventListener('blur', function() {
        this.style.borderColor = '#dee2e6';
      });
    }

    // Apply accent color to user messages
    const style = document.createElement('style');
    style.textContent = `
      .flypost-message.user {
        background: ${config.branding.primaryColor} !important;
      }
      .flypost-concierge-input button:hover:not(:disabled) {
        background: ${config.branding.accentColor} !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    // Use click event for send button
    sendButton.addEventListener('click', handleSend);
    
    // Use keydown instead of keypress to catch Enter before form submission
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    
    // Clear history button
    const clearHistoryButton = document.getElementById('flypost-clear-history');
    if (clearHistoryButton) {
      clearHistoryButton.addEventListener('click', () => {
        if (confirm('Clear conversation history? This cannot be undone.')) {
          clearConversationHistory();
          // Show confirmation message
          const confirmMsg = document.createElement('div');
          confirmMsg.className = 'flypost-message system';
          confirmMsg.textContent = 'Conversation history cleared. Starting fresh!';
          messagesContainer.appendChild(confirmMsg);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      });
    }
  }

  /**
   * Get user's location
   */
  function getUserLocation() {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          locationStatus.textContent = '📍 Location detected';
          locationStatus.classList.remove('error');
          
          // Enable input
          userInput.disabled = false;
          sendButton.disabled = false;
          userInput.focus();
        },
        (error) => {
          console.error('Location error:', error);
          
          // Use default location (Santa Monica, CA)
          userLocation = {
            lat: 34.0195,
            lng: -118.4912
          };
          
          locationStatus.textContent = '📍 Using default location (Santa Monica, CA)';
          locationStatus.classList.add('error');
          
          // Enable input anyway
          userInput.disabled = false;
          sendButton.disabled = false;
          userInput.focus();
        }
      );
    } else {
      // Geolocation not supported, use default
      userLocation = {
        lat: 34.0195,
        lng: -118.4912
      };
      
      locationStatus.textContent = '📍 Using default location (Santa Monica, CA)';
      locationStatus.classList.add('error');
      
      // Enable input
      userInput.disabled = false;
      sendButton.disabled = false;
      userInput.focus();
    }
  }

  /**
   * Add message to chat
   */
  function addMessage(content, type = 'assistant') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `flypost-message ${type}`;
    
    if (type === 'assistant') {
      // Render Markdown for assistant messages
      messageDiv.innerHTML = renderMarkdown(content);
    } else if (type === 'user') {
      // Plain text for user messages
      messageDiv.textContent = content;
    } else {
      // System/error messages
      messageDiv.textContent = content;
    }
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * Show typing indicator
   */
  function showTyping() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'flypost-typing';
    typingDiv.id = 'flypost-typing-indicator';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * Hide typing indicator
   */
  function hideTyping() {
    const typingDiv = document.getElementById('flypost-typing-indicator');
    if (typingDiv) {
      typingDiv.remove();
    }
  }

  /**
   * Add animated message bubble to chat
   */
  function addAnimatedMessage(content, type = 'assistant') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `flypost-message ${type} flypost-message-animated`;
    
    if (type === 'assistant') {
      // Render Markdown for assistant messages
      messageDiv.innerHTML = renderMarkdown(content);
    } else if (type === 'user') {
      // Plain text for user messages
      messageDiv.textContent = content;
    } else {
      // System/error messages
      messageDiv.textContent = content;
    }
    
    messagesContainer.appendChild(messageDiv);
    
    // Trigger animation
    setTimeout(() => {
      messageDiv.classList.add('flypost-message-show');
    }, 10);
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return messageDiv;
  }

  /**
   * Add timestamp group if needed
   */
  function addTimestampIfNeeded() {
    const now = new Date();
    const today = now.toDateString();
    
    // Check if we need to add a timestamp
    const lastTimestamp = messagesContainer.querySelector('.flypost-timestamp:last-of-type');
    if (lastTimestamp) {
      const lastDate = lastTimestamp.getAttribute('data-date');
      if (lastDate === today) {
        return; // Same day, no need for new timestamp
      }
    }
    
    // Determine label
    let label = 'Today';
    
    // If there's a previous timestamp, determine the relationship
    if (lastTimestamp) {
      const lastDate = lastTimestamp.getAttribute('data-date');
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (lastDate === yesterday.toDateString()) {
        // Previous timestamp was yesterday, so current must be today
        label = 'Today';
      } else {
        // Format current date
        label = now.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        });
      }
    }
    
    const timestampDiv = document.createElement('div');
    timestampDiv.className = 'flypost-timestamp';
    timestampDiv.setAttribute('data-date', today);
    timestampDiv.textContent = label;
    messagesContainer.appendChild(timestampDiv);
  }

  /**
   * Create streaming message placeholder
   */
  function createStreamingMessage() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flypost-message assistant flypost-message-animated flypost-message-streaming';
    messageDiv.innerHTML = '';
    messagesContainer.appendChild(messageDiv);
    
    // Trigger animation
    setTimeout(() => {
      messageDiv.classList.add('flypost-message-show');
    }, 10);
    
    return messageDiv;
  }

  /**
   * Update streaming message with new token
   */
  function updateStreamingMessage(messageDiv, content) {
    messageDiv.innerHTML = renderMarkdown(content);
    
    // Auto-scroll if user is near bottom
    const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
    if (isNearBottom) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  /**
   * Complete streaming message
   */
  function completeStreamingMessage(messageDiv) {
    messageDiv.classList.remove('flypost-message-streaming');
  }

  /**
   * Auto-detect and linkify URLs in text
   */
  function linkifyText(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, (url) => {
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    });
  }

  /**
   * Extract property addresses from assistant message text
   * Looks for patterns like "### 🏠 Open House at [Address]"
   */
  function extractAddressesFromAssistantText(text) {
    const re = /^###\s+🏠\s+(?:Open House at\s+)?(.+)$/gm;
    const addresses = [];
    let match;
    while ((match = re.exec(text)) !== null) {
      addresses.push(match[1].trim());
    }
    return addresses;
  }

  /**
   * Display quick action buttons after property listings
   * Shows buttons like "Compare these two", "Plan 1-hour route", etc.
   */
  function displayQuickActions(addresses) {
    // Remove any existing quick actions
    const existingActions = messagesContainer.querySelectorAll('.flypost-quick-actions');
    existingActions.forEach(el => el.remove());

    if (!addresses || addresses.length === 0) {
      return;
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'flypost-quick-actions';

    // Compare button - show if 2 or more properties
    if (addresses.length >= 2) {
      const compareButton = document.createElement('button');
      compareButton.className = 'flypost-quick-action-button';
      compareButton.innerHTML = '🔄 Compare these two';
      compareButton.onclick = () => {
        handleQuickAction('compare_last_two', addresses.slice(0, 2));
      };
      actionsDiv.appendChild(compareButton);
    }

    // Route planning button - show if 2 or more properties
    if (addresses.length >= 2) {
      const routeButton = document.createElement('button');
      routeButton.className = 'flypost-quick-action-button';
      routeButton.innerHTML = '🗺️ Plan 1-hour route';
      routeButton.onclick = () => {
        handleQuickAction('plan_route', addresses);
      };
      actionsDiv.appendChild(routeButton);
    }

    // Walkable button - show if any properties
    if (addresses.length >= 1) {
      const walkableButton = document.createElement('button');
      walkableButton.className = 'flypost-quick-action-button';
      walkableButton.innerHTML = '🚶 Walkable to Pier';
      walkableButton.onclick = () => {
        handleQuickAction('walkable_to_pier', addresses);
      };
      actionsDiv.appendChild(walkableButton);
    }

    messagesContainer.appendChild(actionsDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * Handle quick action button clicks
   * Constructs appropriate message with metadata and sends to backend
   */
  function handleQuickAction(action, addresses) {
    let messageText = '';
    
    switch (action) {
      case 'compare_last_two':
        messageText = `Compare these properties: ${addresses[0]} and ${addresses[1]}`;
        break;
      case 'plan_route':
        messageText = `Plan a 1-hour route to visit these open houses: ${addresses.join(', ')}`;
        break;
      case 'walkable_to_pier':
        messageText = `Which of these properties are walkable to the pier?`;
        break;
      default:
        messageText = action;
    }

    // Set input value and trigger send
    userInput.value = messageText;
    handleSend();
  }

  /**
   * Handle send action with double-send prevention
   * This wrapper prevents multiple submissions from both keydown and submit events
   */
  async function handleSend() {
    // Prevent double sends from rapid clicks or Enter key + button click
    if (isSending) {
      return;
    }

    // Capture input value immediately
    const inputEl = userInput;
    const raw = inputEl.value || '';
    const message = raw.trim();
    
    // Return early if empty
    if (!message) {
      return;
    }

    // Check if location is available
    if (!userLocation) {
      return;
    }

    // Clear input immediately to prevent concatenation issues
    inputEl.value = '';
    
    // Set sending flag
    isSending = true;
    setSendDisabled(true);

    try {
      await sendMessage(message);
    } finally {
      // Always reset the flag
      isSending = false;
      setSendDisabled(false);
      inputEl.focus();
    }
  }

  /**
   * Set send button disabled state
   */
  function setSendDisabled(disabled) {
    if (sendButton) {
      sendButton.disabled = disabled;
    }
    if (userInput) {
      userInput.disabled = disabled;
    }
  }

  /**
   * Send message to backend with streaming support
   */
  async function sendMessage(message) {
    // Add timestamp if needed
    addTimestampIfNeeded();

    // Add user message to chat with animation
    addAnimatedMessage(message, 'user');
    
    // Disable input while processing (redundant but kept for safety)
    isProcessing = true;
    showTyping();

    try {
      const requestBody = {
        message: message,
        lat: userLocation.lat,
        lng: userLocation.lng,
        conversationHistory: conversationHistory
      };

      // Add brokerageId if configured
      if (config.brokerageId) {
        requestBody.brokerageId = config.brokerageId;
      }

      // Try streaming endpoint first
      try {
        const response = await fetch(`${config.apiBase}/api/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          throw new Error('Streaming not available, falling back to regular endpoint');
        }

        hideTyping();

        // Create streaming message placeholder
        const streamingMessage = createStreamingMessage();
        let fullContent = '';

        // Read the stream with proper multi-byte character handling
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8', { stream: true });

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));

                if (data.type === 'token') {
                  fullContent += data.content;
                  updateStreamingMessage(streamingMessage, fullContent);
                } else if (data.type === 'done') {
                  completeStreamingMessage(streamingMessage);
                } else if (data.type === 'error') {
                  throw new Error(data.message);
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE data:', line, parseError);
                // Continue processing other lines
              }
            }
          }
        }

        // Update conversation history
        conversationHistory.push({
          role: 'user',
          content: message
        });
        conversationHistory.push({
          role: 'assistant',
          content: fullContent
        });
        
        // Save to localStorage
        saveConversationHistory();

        // Extract addresses and display quick actions
        const addresses = extractAddressesFromAssistantText(fullContent);
        if (addresses.length > 0) {
          displayQuickActions(addresses);
        }

      } catch (streamError) {
        console.log('Streaming failed, falling back to regular endpoint:', streamError.message);
        
        // Fallback to regular endpoint
        const response = await fetch(`${config.apiBase}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        hideTyping();

        if (response.ok && data.success) {
          // Add message to chat with animation
          addAnimatedMessage(data.message, 'assistant');
          
          // Update conversation history
          conversationHistory.push({
            role: 'user',
            content: message
          });
          conversationHistory.push({
            role: 'assistant',
            content: data.message
          });
          
          // Save to localStorage
          saveConversationHistory();
          
          // Display suggested follow-ups if available
          if (data.suggestedFollowUps && data.suggestedFollowUps.length > 0) {
            displaySuggestedFollowUps(data.suggestedFollowUps);
          }

          // Extract addresses and display quick actions
          const addresses = extractAddressesFromAssistantText(data.message);
          if (addresses.length > 0) {
            displayQuickActions(addresses);
          }
        } else {
          addAnimatedMessage(data.error || 'Sorry, I encountered an error. Please try again.', 'error');
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      hideTyping();
      
      // Provide more specific error messages
      let errorMessage;
      if (error.name === 'AbortError') {
        errorMessage = 'Request timed out. Please try again.';
      } else {
        errorMessage = 'Unable to connect to the server. Please check your internet connection and try again.';
      }
      
      addAnimatedMessage(errorMessage, 'error');
    } finally {
      // Re-enable input (cleanup handled by handleSend)
      isProcessing = false;
    }
  }

  /**
   * Display suggested follow-up questions
   * Removes previous suggestions to avoid cluttering the UI
   */
  function displaySuggestedFollowUps(suggestions) {
    // Remove any existing suggestion containers
    const existingSuggestions = messagesContainer.querySelectorAll('.flypost-suggestions');
    existingSuggestions.forEach(el => el.remove());
    
    const suggestionsDiv = document.createElement('div');
    suggestionsDiv.className = 'flypost-suggestions';
    
    const title = document.createElement('div');
    title.className = 'flypost-suggestions-title';
    title.textContent = 'Suggested questions:';
    suggestionsDiv.appendChild(title);
    
    suggestions.forEach(suggestion => {
      const button = document.createElement('button');
      button.className = 'flypost-suggestion-button';
      button.textContent = suggestion;
      button.onclick = () => {
        userInput.value = suggestion;
        sendMessage();
      };
      suggestionsDiv.appendChild(button);
    });
    
    messagesContainer.appendChild(suggestionsDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * Initialize widget when DOM is ready
   */
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createWidget);
    } else {
      createWidget();
    }
  }

  // Start initialization
  init();
})();
