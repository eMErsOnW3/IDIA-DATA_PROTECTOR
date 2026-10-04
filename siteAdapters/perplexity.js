IDIAPlatforms.register({id:'perplexity',name:'Perplexity',hostnames:['perplexity.ai','www.perplexity.ai'],routes:[/^\/search\/([A-Za-z0-9_-]{1,200})(?:\/|$)/],
 composers:['textarea[placeholder*="Ask"]','[contenteditable="true"][data-lexical-editor="true"][role="textbox"]','[contenteditable="true"][aria-label*="Ask"]'],
 containers:'form, [data-testid="composer"]',sendIds:['send-button','submit-button'],enter:true,
 transcript:'[data-message-author-role], [data-testid="user-message"], [data-testid="answer"]',newPaths:['/']});
