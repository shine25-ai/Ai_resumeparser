# UI/UX review: changes and screenshots

Code: commit bd86096 on `development`. Before screenshots were taken on 2026-11-11 from a local copy with seeded test data; after screenshots show the built change.

**Summary:** 49 files, about +1,200 / −9,600 lines. `InterviewManagement.tsx` 6,476 → ~1,680 lines, `JDMatch.tsx` 2,107 → ~1,080. Interview Dashboard, Client Feedback and the candidate-details pop-up removed (old links redirect).

## Phase 1 · Quick fixes

### 1. Interviews API needs a login

Before: `GET /api/v1/interviews` with no login returned every interview (candidate names, emails, meeting links), because a request without a token was treated as the first user in the database. After: **401 Unauthorized**. The same now applies to settings (SMTP, AI config), mail templates, resume templates and transcription, which had no check at all. Client and interviewer accounts only see their own interviews.

| Before | After |
| --- | --- |
| <img src="before/08-api-no-login.jpg" alt="1. Interviews API needs a login (before)" width="420"> | <img src="after/01-api-401.png" alt="1. Interviews API needs a login (after)" width="420"> |

### 2. Client Feedback mock page removed

It showed a hard-coded candidate and "Submit" saved nothing. Removed from the sidebar and routes; `/client-feedback` redirects to Interviews.

| Before | After |
| --- | --- |
| <img src="before/07-client-feedback-mock.jpg" alt="2. Client Feedback mock page removed (before)" width="420"> | <img src="after/02-14-sidebar.png" alt="2. Client Feedback mock page removed (after)" width="420"> |

### 3. Interview filters and buttons

Clear Filters ignored the Recommendation filter (rows stayed hidden with no way to clear), and selecting rows showed two Bulk Feedback buttons. Now Clear Filters shows a count and covers every filter; one bulk button; the fake "Save draft" is gone; Name/Email boxes folded into the main search.

| Before | After |
| --- | --- |
| <img src="before/02-filter-no-clear.png" alt="3. Interview filters and buttons (before)" width="420"><br><img src="before/03-duplicate-bulk-button.jpg" alt="3. Interview filters and buttons (before)" width="420"> | <img src="after/03-filters-clear.jpg" alt="3. Interview filters and buttons (after)" width="420"><br><img src="after/03-one-bulk-button.jpg" alt="3. Interview filters and buttons (after)" width="420"> |

### 4. Search sends 1 request instead of 21

Each keystroke refetched interviews, all users and all interview types. Search is now debounced (300 ms) and users/types load once. Typing "Lakshmi": **21 requests → 1** (measured).

### 5. Dashboard header

Search box, bell and gear did nothing; every user had the same stock photo. Search now opens Candidates filtered by the text; dead buttons removed; initials avatar.

| Before | After |
| --- | --- |
| <img src="before/01-dashboard-header.png" alt="5. Dashboard header (before)" width="420"> | <img src="after/05-dashboard-header.png" alt="5. Dashboard header (after)" width="420"> |

## Phase 2 · One interview flow

### 6. One short interview form

Six forms (Schedule, Edit, Reschedule, Next Round, Interview Dashboard, JD Match) became one `InterviewForm` with about 10 fields. Salary, joining date and outcome moved to the feedback step. The panel's availability shows inline; scheduling a candidate who already has an open interview now says why instead of silently doing nothing.

| Before | After |
| --- | --- |
| <img src="before/05-schedule-form.jpg" alt="6. One short interview form (before)" width="420"> | <img src="after/06-interview-form.jpg" alt="6. One short interview form (after)" width="420"><br><img src="after/06-reschedule-form.jpg" alt="6. One short interview form (after)" width="420"> |

### 7. One Interviews screen with a Today view

Interview Dashboard and Interviews showed the same data twice. Interviews now opens on **Today and Upcoming** (plus "Needs feedback"); **All** is the table. `/interview-dashboard` redirects.

| Before | After |
| --- | --- |
| <img src="before/06-interview-dashboard.jpg" alt="7. One Interviews screen with a Today view (before)" width="420"><br><img src="before/10-interviews-list.jpg" alt="7. One Interviews screen with a Today view (before)" width="420"> | <img src="after/07-today-view.jpg" alt="7. One Interviews screen with a Today view (after)" width="420"> |

### 8. Row menu fits the interview's state

Every row offered the same 8 actions, even a no-show from last week. The same row now offers 3.

| Before | After |
| --- | --- |
| <img src="before/04-row-menu.jpg" alt="8. Row menu fits the interview's state (before)" width="420"> | <img src="after/08-row-menu-no-show.jpg" alt="8. Row menu fits the interview's state (after)" width="420"> |

### 9. One feedback panel

The feedback panel now serves one interview or many (the separate ~1,000-line single modal is gone). A verdict you pick is never overwritten by later rating changes; offer fields appear only after Selected; bulk feedback now records who gave it.

| Before | After |
| --- | --- |
| <img src="before/07-client-feedback-mock.jpg" alt="9. One feedback panel (before)" width="420"> | <img src="after/09-feedback-panel.jpg" alt="9. One feedback panel (after)" width="420"> |

## Phase 3 · Data model

### 10. Stage and Verdict instead of one 14-value Recommendation

**Verdict** (Pending, Selected, Rejected, On Hold, No Show) and **Stage** (Screening, Interviewing, Offer, Hired, Closed) are computed from the existing `recommendation` on read. No stored data is rewritten. Filters on the Interviews table.

| Before | After |
| --- | --- |
| <img src="before/10-interviews-list.jpg" alt="10. Stage and Verdict instead of one 14-value Recommendation (before)" width="420"> | <img src="after/10-verdict-stage.jpg" alt="10. Stage and Verdict instead of one 14-value Recommendation (after)" width="420"> |

### 11. Candidate list shows the hiring stage

Stage column and filter chips; parse status shown only when parsing failed. Profile route is now `/candidates/:id` (old links redirect).

| Before | After |
| --- | --- |
| <img src="before/11-candidate-database.jpg" alt="11. Candidate list shows the hiring stage (before)" width="420"> | <img src="after/11-candidates-stage.jpg" alt="11. Candidate list shows the hiring stage (after)" width="420"> |

### 12. Analytics and Dashboard from real data

Counts read resume statuses nothing ever sets (always 0), the trend line was generated from totals, the success ring was hard-coded at 70%, and five donut charts drew nothing. All now come from interview data, with a working date range.

| Before | After |
| --- | --- |
| <img src="before/12-analytics.jpg" alt="12. Analytics and Dashboard from real data (before)" width="420"> | <img src="after/12-analytics.jpg" alt="12. Analytics and Dashboard from real data (after)" width="420"><br><img src="after/12b-dashboard.jpg" alt="12. Analytics and Dashboard from real data (after)" width="420"> |

## Phase 4 · Polish

### 13. In-app messages instead of browser popups

All `alert()` / `confirm()` calls replaced by a shared toast and confirm dialog.

| Before | After |
| --- | --- |
| _No visual before (see text)_ | <img src="after/13-toast.jpg" alt="13. In-app messages instead of browser popups (after)" width="420"> |

### 14. Sidebar down to 7 items

Dashboard, Upload, Candidates, JD Match, Interviews, Analytics, Settings. Resume templates open from Candidates; interview types live in Settings.

| Before | After |
| --- | --- |
| <img src="before/09-sidebar.png" alt="14. Sidebar down to 7 items (before)" width="420"> | <img src="after/02-14-sidebar.png" alt="14. Sidebar down to 7 items (after)" width="420"> |

### 15. Phone layout

Bottom navigation bar and interview cards instead of a side rail and a 1,150 px table.

| Before | After |
| --- | --- |
| <img src="before/13-interviews-phone.jpg" alt="15. Phone layout (before)" width="420"> | <img src="after/15-phone.jpg" alt="15. Phone layout (after)" width="420"> |

## Restored after review (PR #60)

An audit of the old screens against the new ones found fields and features that were no longer reachable. [PR #60](https://github.com/shine25-ai/Ai_resumeparser/pull/60) restores all of them, so **nothing captured or offered before is missing**. The main interview form still shows the essentials first.

### Fields restored
| Field | Where it is now |
| --- | --- |
| Meeting platform, interview location, HR call verification | Interview form → More details |
| Job location, job type | Interview form → More details |
| Candidate's requested date / time / role, salary requested | Interview form → More details (also in the feedback panel's offer section) |
| Documents attached when scheduling | Interview form → More details (upload) |
| Interview status (manual change) | Interview form → More details, in Edit mode |
| Final salary, joining date | Feedback panel → Offer details, openable any time (auto-opens after Selected) |

| More details (optional) | Offer details |
| --- | --- |
| <img src="after/restored/01-more-details.jpg" alt="More details (optional)" width="420"> | <img src="after/restored/02-offer-details.jpg" alt="Offer details" width="420"> |

### Features restored
- **Interview history** pop-up (every round with all details), as a row action. Its resume button linked to a route that doesn't exist; it now opens the candidate profile.
- **Email interview summary** for selected interviews, with an Excel/CSV attachment (was on the old Interview Dashboard).
- **Summary counts** (old Interview Dashboard) on the Today and Upcoming view.
- **Sort by score** and filtering by the **exact old outcome values** on the All view.
- **Edit details** on finished and closed interviews.

| Interview history | Row actions |
| --- | --- |
| <img src="after/restored/03-interview-history.jpg" alt="Interview history" width="420"> | <img src="after/restored/04-row-menu.jpg" alt="Row actions" width="420"> |

| Email interview summary | Summary counts |
| --- | --- |
| <img src="after/restored/05-email-summary.jpg" alt="Email interview summary" width="420"> | <img src="after/restored/06-summary-counts.jpg" alt="Summary counts" width="420"> |

### Client feedback
The old Client Feedback page was a mock (hard-coded candidate; Save stored nothing), so no saved data was lost by removing it. Client feedback is entered in the feedback panel's **Client Evaluators** tab. A client user signs in, sees only their own interviews, and the panel opens on their own entry. Checked by signing in as a test client:
- **Fixed (older bug):** the panel showed "4" and "Selected" for evaluators not yet rated but saved them empty, and saving without a rating wrote a rating of 1. Empty now shows as "Not rated" / Pending, and only entered ratings are saved.
- Roles that had only the old **Client Feedback** permission now open the Interviews page instead of an empty app.

| Client user's view | Client feedback |
| --- | --- |
| <img src="after/restored/08-client-user-view.jpg" alt="Client user's view" width="420"> | <img src="after/restored/09-client-feedback.jpg" alt="Client feedback" width="420"> |

### Bugs fixed while restoring
- Editing an interview reset its type to the first configured type; it now keeps its own type.
- An interview earlier today couldn't get feedback until the next day; interviews scheduled today now offer **Give feedback**.

### Walkthrough video
[`docs/ux-review/walkthrough.mp4`](https://github.com/shine25-ai/Ai_resumeparser/blob/fix/restore-captured-fields/docs/ux-review/walkthrough.mp4): a 1 min 50 s captioned walkthrough of the full flow (test data).

## Testing
- `tsc` clean; production build succeeds.
- Backend: 134 passed, including new `test_route_auth.py` and `test_hiring_stage.py`. The 1 failure + 5 errors also fail before these changes (test setup).
- Checked in the browser against a local database with seeded interviews. Not clicked through: the in-app delete confirmation and the transcription fix.

## Notes for reviewers
- Callers without a login token now get 401 on the routes above. Nothing in this repo calls them without one.
- Settings needs login but not admin; restricting writes to admins is a sensible follow-up.
- This landed on `development` without review; comments on this PR are the place to flag anything.
