IDIAPlatforms.register({id:'copilot',name:'Microsoft Copilot',hostnames:['copilot.microsoft.com'],routes:[/^\/chats\/([A-Za-z0-9_-]{1,128})(?:\/|$)/,/^\/conversations\/([A-Za-z0-9_-]{1,128})(?:\/|$)/],queryKeys:['conversationId'],
 composers:['textarea#userInput','textarea[placeholder*="Copilot"]','[contenteditable="true"][aria-label*="Copilot"]'],
 containers:'form, [data-testid="composer"]',sendIds:['send-button','submit-button'],enter:true,
 transcript:'[data-message-author-role], [data-content="user-message"], [data-content="ai-message"]',newPaths:['/']});
