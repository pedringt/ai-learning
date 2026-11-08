# #640 held-out v2, run 1 (Nov 8)

Single run, offline, no model calls; not tuned before reporting.

```
code fe60ace set 085814ff713d5a9c
TALLY {'success': 13, 'appropriate clarification': 2, 'incorrect: status request passed to normal Ask': 1, 'unnecessary clarification': 1, 'correct pass-through': 5, 'incorrect: answered or asked with no matching Question': 1, 'incorrect: non-status request intercepted': 1} of 24
   success                                              expected=v-hr-owner           got=v-hr-owner           | Was the HR onboarding checklist question answered?  []
   success                                              expected=v-hr-owner           got=v-hr-owner           | Has HR answered who owns the onboarding checklist?  []
   success                                              expected=v-us-region          got=v-us-region          | Was the US log region question answered?  []
   success                                              expected=v-eu-region          got=v-eu-region          | Is the EU log region question still open?  []
   appropriate clarification                            expected=clarify              got=clarify              | Is the log region question answered?  [best match shares only 1 word and others share one too]
   success                                              expected=v-migration          got=v-migration          | Has Operations answered when the ticket migration starts?  []
   success                                              expected=v-migration          got=v-migration          | Was the migration question resolved?  []
   success                                              expected=v-cancel             got=v-cancel             | Was the contract cancellation question answered?  []
!! incorrect: status request passed to normal Ask       expected=v-cancel             got=pass                 | Is the cancellation question answered?  [no Question shares a word with the request]
!! unnecessary clarification                            expected=v-notify             got=clarify              | Is the user notification question answered?  [best match shares only 1 word and others share one too]
   success                                              expected=v-internal-pricing   got=v-internal-pricing   | Was the internal pricing question answered?  []
   success                                              expected=v-external-pricing   got=v-external-pricing   | Is the external user pricing question still unanswered?  []
   appropriate clarification                            expected=clarify              got=clarify              | Is the pricing question answered?  [best match shares only 1 word and others share one too]
   success                                              expected=v-dashboard          got=v-dashboard          | Was the executive dashboard question answered?  []
   success                                              expected=v-accessibility      got=v-accessibility      | Is the WCAG question still open?  []
   success                                              expected=v-backup             got=v-backup             | Was the transcript backup question answered?  []
   success                                              expected=v-vendor-sla         got=v-vendor-sla         | Has Procurement answered the vendor SLA question?  []
   correct pass-through                                 expected=none                 got=pass                 | Was it answered?  [no Question shares a word with the request]
!! incorrect: answered or asked with no matching Question expected=none                 got=v-migration          | Which questions are still open about the migration?  []
!! incorrect: non-status request intercepted            expected=pass                 got=v-vendor-sla         | Is the vendor SLA question answered satisfactorily?  []
   correct pass-through                                 expected=pass                 got=pass                 | Is the backup answer outdated?  [no explicit Question reference]
   correct pass-through                                 expected=pass                 got=pass                 | Is the dashboard settled?  [no explicit Question reference]
   correct pass-through                                 expected=pass                 got=pass                 | What did Legal decide about cancelling early?  [no explicit Question reference]
   correct pass-through                                 expected=none                 got=pass                 | Was the question about the holiday party answered?  [no Question shares a word with the request]
```
