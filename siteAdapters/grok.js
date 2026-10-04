IDIAPlatforms.register({id:'grok',name:'Grok',hostnames:['grok.com','www.grok.com'],routes:[/^\/(?:c|chat)\/([A-Za-z0-9_-]{1,128})(?:\/|$)/],
 composers:['textarea[placeholder*="Grok"]','textarea[aria-label*="Grok"]','[contenteditable="true"][aria-label*="Grok"]'],
 containers:'form, [data-testid="composer"]',sendIds:['send-button'],enter:true,
 transcript:'[data-message-author-role], [data-testid="user-message"], [data-testid="assistant-message"]',newPaths:['/']});
