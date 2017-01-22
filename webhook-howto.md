Create a webhook on the Athom developer pages
Use this as the parser body:
`return homey_data.homey == webhook_data.query.homey;`

Include the folowing variables in env.json or during app store submission:
```{
    "WEBHOOK_ID": "...",
    "WEBHOOK_SECRET": "..."
}```

Replace the dots by the actual values for the webhook you created