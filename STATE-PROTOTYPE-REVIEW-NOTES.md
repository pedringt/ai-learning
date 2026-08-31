# State prototype review candidate

Built from `01-BASELINE-PROTOTYPE-KNOWN-GOOD.zip`.

Changes are limited to the State prototype:
- Sidebar order is now Workspace → Notes → Open Items → Project.
- Open Items and Project are expandable parent rows, not landing pages.
- Review and Questions live under Open Items.
- History lives under Project.
- Active child views force their parent group open.
- Project includes contextual `View history →` links for Pilot direction and Feature access.
- Feature Access review continues to update maintained Current State automatically; its accepted change is now tagged into contextual History.
- Notes filter pills use consistent count-badge sizing/treatment.

The broader portfolio/case-study pages were not edited.

QA note: JavaScript syntax and static structure assertions pass. The working environment's Chromium process hangs even on the known-good baseline, so rendered-browser verification could not be completed here. Please use local visual/interaction review as the authoritative checkpoint before portfolio edits.
