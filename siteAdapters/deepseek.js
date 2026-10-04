IDIAPlatforms.register({id:'deepseek',name:'DeepSeek',hostnames:['chat.deepseek.com'],routes:[/^\/a\/chat\/s\/([A-Za-z0-9_-]{1,128})(?:\/|$)/,/^\/chat\/([A-Za-z0-9_-]{1,128})(?:\/|$)/],
 composers:['textarea#chat-input','textarea[placeholder*="DeepSeek"]','textarea[aria-label*="DeepSeek"]'],
 containers:'form, [data-testid="composer"]',sendIds:['send-button'],enter:true,
 transcript:'[data-message-role], [data-role="user"], [data-role="assistant"]',newPaths:['/','/a/chat']});
