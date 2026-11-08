# #640 held-out run 1 (Nov 8)

Code df5d1cf, held-out set sha256 2d824655bfea37c9… (frozen). Single run, offline, no model calls. Not tuned before reporting.

```
TALLY {'success': 7, 'unnecessary clarification': 2, 'appropriate clarification': 4, 'incorrect': 1, 'correct pass-through': 7} of 21
   success                                              expected=h-sso            got=h-sso            | Was the SSO provider question answered?  []
!! unnecessary clarification                            expected=h-sso            got=clarify          | Has Security answered which SSO provider the client will use?  [request words point to another Question: security]
   success                                              expected=h-sso-timeout    got=h-sso-timeout    | Is the SSO session timeout question still open?  []
   appropriate clarification                            expected=clarify          got=clarify          | Is the SSO question answered?  [best match shares only 1 word]
   success                                              expected=h-training       got=h-training       | Was the question about the planned finish date for pilot training resolved?  []
   appropriate clarification                            expected=clarify          got=clarify          | Is the training question still unanswered?  [best match shares only 1 word]
   success                                              expected=h-training-owner got=h-training-owner | Was the question on who owns the training materials answered?  []
!! unnecessary clarification                            expected=h-residency      got=clarify          | Was the EU data residency question answered?  [best match shares only 1 word]
   success                                              expected=h-budget-cap     got=h-budget-cap     | Has Finance answered the maximum monthly model spend question?  []
   success                                              expected=h-budget-alert   got=h-budget-alert   | Is the monthly spend alert question answered?  []
   appropriate clarification                            expected=clarify          got=clarify          | Is the monthly spend question answered?  [two Questions match equally]
   success                                              expected=h-slack-support  got=h-slack-support  | Was the #support Slack channel question answered?  []
   appropriate clarification                            expected=clarify          got=clarify          | Is the Slack channel evidence question resolved?  [two Questions match equally]
!! incorrect: status request passed to normal Ask       expected=h-escalation     got=pass             | Was the escalation question answered?  [no Question shares a word with the request]
   correct pass-through                                 expected=pass             got=pass             | Is the SSO provider settled?  [no explicit Question reference]
   correct pass-through                                 expected=pass             got=pass             | Is Okta approved?  [no explicit Question reference]
   correct pass-through                                 expected=pass             got=pass             | Was the SSO provider question answered correctly?  [asks about the answer's content or validity]
   correct pass-through                                 expected=pass             got=pass             | Is the recorded answer on EU residency still valid?  [asks about the answer's content or validity]
   correct pass-through                                 expected=pass             got=pass             | What did Finance say about the monthly spend cap?  [asks about the answer's content or validity]
   correct pass-through                                 expected=pass             got=pass             | Why was the escalation question closed?  [asks about the answer's content or validity]
   correct pass-through                                 expected=none             got=pass             | Was the question about the office move answered?  [no Question shares a word with the request]
```
