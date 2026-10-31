TOOLS={{#list tools join=","}}{{this}}{{/list}}
DEVICES={{#list xdevTools join=","}}{{name}}={{summary}}{{/list}}
DOCS={{xdevDocs}}
{{#if browserEnabled}}BROWSER=enabled{{else}}BROWSER=disabled{{/if}}
