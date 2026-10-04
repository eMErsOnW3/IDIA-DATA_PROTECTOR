IDIAPlatforms.register({id:'chatgpt',name:'ChatGPT',hostnames:['chatgpt.com'],routes:[/(?:^|\/)c\/([A-Za-z0-9-]{1,128})(?:\/|$)/],
 composers:['#prompt-textarea','textarea[name="prompt-textarea"]','[data-testid="prompt-textarea"]','#composer-background [contenteditable="true"]','[data-testid="composer"] textarea','[data-testid="composer"] [contenteditable="true"]'],
 containers:'form, #composer-background, [data-testid="composer"], [data-testid="composer-container"], [data-type="unified-composer"]',
 sendIds:['send-button','send-message-button','composer-send-button'],sendElementIds:['composer-submit-button'],
 enterSelectors:'#prompt-textarea, [name="prompt-textarea"], [data-testid="prompt-textarea"], .ProseMirror',
 transcript:'[data-message-author-role="user"], [data-message-author-role="assistant"]',newPaths:['/'],enter:true});
