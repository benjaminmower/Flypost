/**
 * Flypost Concierge Widget v2
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

  // State
  let userLocation = null;
  let isProcessing = false;
  let messagesContainer = null;
  let userInput = null;
  let sendButton = null;
  let locationStatus = null;

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
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
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

    // When content is the full data object with listings, render rich cards
    if (type === 'assistant' && content && Array.isArray(content.listings)) {
      renderAssistantWithListings(messageDiv, content);
    } else {
      // Fallback: render plain text (string) content
      const text = typeof content === 'string' ? content : content?.message || '';
      const lines = text.split('\n');
      lines.forEach((line, index) => {
        messageDiv.appendChild(document.createTextNode(line));
        if (index < lines.length - 1) {
          messageDiv.appendChild(document.createElement('br'));
        }
      });
    }

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * Render assistant message with listings cards
   * Expects content like:
   * {
   *   message: "Here are some listings...",
   *   listings: [ { address, city, price, beds, baths, ... }, ... ]
   * }
   */
  function renderAssistantWithListings(container, content) {
    const title = document.createElement('div');
    title.className = 'flypost-assistant-intro';
    title.textContent = content.message || 'Here are some options I found for you:';
    container.appendChild(title);

    const listWrapper = document.createElement('div');
    listWrapper.className = 'flypost-listings-grid';

    (content.listings || []).forEach((listing) => {
      const card = document.createElement('div');
      card.className = 'flypost-listing-card';

      const address = document.createElement('div');
      address.className = 'flypost-listing-address';
      address.textContent = `${listing.address || ''}${listing.city ? ', ' + listing.city : ''}`;
      card.appendChild(address);

      const meta = document.createElement('div');
      meta.className = 'flypost-listing-meta';
      const parts = [];
      if (listing.price) parts.push(listing.price);
      if (listing.beds != null) parts.push(`${listing.beds} bd`);
      if (listing.baths != null) parts.push(`${listing.baths} ba`);
      if (listing.sqft) parts.push(`${listing.sqft} sq ft`);
      meta.textContent = parts.join(' • ');
      card.appendChild(meta);

      if (listing.openHouse) {
        const oh = document.createElement('div');
        oh.className = 'flypost-listing-openhouse';
        oh.textContent = listing.openHouse;
        card.appendChild(oh);
      }

      if (listing.summary) {
        const summary = document.createElement('div');
        summary.className = 'flypost-listing-summary';
        summary.textContent = listing.summary;
        card.appendChild(summary);
      }

      if (listing.features) {
        const features = document.createElement('div');
        features.className = 'flypost-listing-features';
        features.textContent = listing.features;
        card.appendChild(features);
      }

      if (listing.agent && (listing.agent.name || listing.agent.phone || listing.agent.email)) {
        const agentDiv = document.createElement('div');
        agentDiv.className = 'flypost-listing-agent';

        const strongTag = document.createElement('strong');
        strongTag.textContent = 'Agent:';
        agentDiv.appendChild(strongTag);

        if (listing.agent.name) {
          agentDiv.appendChild(document.createTextNode(' ' + listing.agent.name));
        }

        if (listing.agent.phone) {
          const phoneLink = document.createElement('a');
          phoneLink.href = `tel:${encodeURIComponent(listing.agent.phone)}`;
          phoneLink.textContent = ` 📞 ${listing.agent.phone}`;
          agentDiv.appendChild(phoneLink);
        }

        if (listing.agent.email) {
          const emailLink = document.createElement('a');
          emailLink.href = `mailto:${encodeURIComponent(listing.agent.email)}`;
          emailLink.textContent = ' ✉️ Email';
          agentDiv.appendChild(emailLink);
        }

        card.appendChild(agentDiv);
      }

      listWrapper.appendChild(card);
    });

    container.appendChild(listWrapper);
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
   * Send message to backend
   */
  async function sendMessage() {
    const message = userInput.value.trim();
    
    if (!message || isProcessing || !userLocation) {
      return;
    }

    // Add user message to chat
    addMessage(message, 'user');
    userInput.value = '';
    
    // Disable input while processing
    isProcessing = true;
    userInput.disabled = true;
    sendButton.disabled = true;
    showTyping();

    try {
      const requestBody = {
        message: message,
        lat: userLocation.lat,
        lng: userLocation.lng
      };

      // Add brokerageId if configured
      if (config.brokerageId) {
        requestBody.brokerageId = config.brokerageId;
      }

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
        // Prefer structured listings when present
        if (data.listings && data.listings.length > 0) {
          addMessage(data, 'assistant');
        } else {
          addMessage(data.message, 'assistant');
        }
      } else {
        addMessage(data.error || 'Sorry, I encountered an error. Please try again.', 'error');
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
      
      addMessage(errorMessage, 'error');
    } finally {
      // Re-enable input
      isProcessing = false;
      userInput.disabled = false;
      sendButton.disabled = false;
      userInput.focus();
    }
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
