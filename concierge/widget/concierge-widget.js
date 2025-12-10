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
    
    // For assistant messages, render as HTML to support markdown-like formatting
    if (type === 'assistant') {
      messageDiv.innerHTML = formatMessage(content);
    } else {
      messageDiv.textContent = content;
    }
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * Format message content (preserve line breaks, links, etc.)
   */
  function formatMessage(content) {
    // Escape HTML first
    const escaped = escapeHtml(content);
    
    // Convert line breaks
    return escaped.replace(/\n/g, '<br>');
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
        addMessage(data.message, 'assistant');
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
