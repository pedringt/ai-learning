/* v99: Learning Guide coverage-map rewrite and copy-density cleanup.
   The guide is now a top-level map of the areas Paige wants to keep touching,
   while exercises and deep reference material remain separate. */
(()=>{
  const root=document.getElementById('ai-cs-mock');
  if(!root)return;

  const learn=root.querySelector('[data-page="learn"]');
  if(learn){
    learn.innerHTML=`
      <div class="hero learning-hero page-intro">
        <div class="eyebrow">Practical AI Learning Guide</div>
        <h2 aria-level="1" class="route-title" role="heading">The areas I want to keep touching in AI work</h2>
        <p class="lead">This is a coverage map, not a curriculum. I use it to notice where my learning is getting lopsided and return to the areas I have not practiced recently.</p>
      </div>
      <div class="band learning-guide-principle">
        <h3>Tools are not the curriculum</h3>
        <p>I keep enough technical fluency to understand what current AI systems can do, but the goal is broader: understand the business, choose the right intervention, make it trustworthy, get it adopted, and prove whether it helped.</p>
        <div class="resource-row"><a class="resource-link" href="ai-professional-edge.html" target="_blank" rel="noopener">Open AI Professional Edge</a></div>
      </div>
      <section aria-label="Learning coverage areas" class="learning-stages">
        <div class="section-kicker"><span>Coverage map</span></div>
        <h2>Nine areas I return to as the work demands them.</h2>
        <p class="section-lead learning-curriculum-intro">Each area is intentionally short. The deeper references are there when I need them; exercises live separately.</p>

        <details class="learning-stage" id="discovery-workflows"><summary><span class="stage-num">01</span><span class="stage-main"><b>Business &amp; Workflow Discovery</b><small>Understand how the work actually happens before deciding what to change.</small><span class="topic-preview">problem discovery · workflow mapping · stakeholder needs · constraints · baseline evidence</span></span></summary><div class="stage-body"><div class="stage-group"><h3>What I want to understand</h3><div class="learning-item"><p>Find the real problem behind a requested solution. Map the current workflow, where it breaks down, who owns it, and what evidence would show that changing it is worthwhile.</p></div></div><div class="resource-row"><a class="resource-link" href="cheat-sheets/MERIDIAN_DISCOVERY_QUESTIONS_REASONING.pdf" target="_blank" rel="noopener noreferrer">Discovery questions</a></div></div></details>

        <details class="learning-stage" id="product-strategy"><summary><span class="stage-num">02</span><span class="stage-main"><b>AI Opportunity &amp; Product Judgment</b><small>Decide whether AI belongs in the solution at all.</small><span class="topic-preview">AI vs. automation · build/buy/partner · feasibility · prioritization · expected value</span></span></summary><div class="stage-body"><div class="stage-group"><h3>What I want to understand</h3><div class="learning-item"><p>Compare AI with ordinary software, process changes, and doing nothing. Decide how much autonomy is useful, whether the opportunity is worth pursuing, and what evidence would change the recommendation.</p></div></div><div class="resource-row"><a class="resource-link" href="cheat-sheets/BUILD_BOOST_BUY_DECISION_TREE.pdf" target="_blank" rel="noopener noreferrer">Build / boost / buy</a></div></div></details>

        <details class="learning-stage" id="ai-foundations"><summary><span class="stage-num">03</span><span class="stage-main"><b>AI Systems &amp; Technical Fluency</b><small>Understand the AI-specific pieces well enough to scope, evaluate, and troubleshoot them.</small><span class="topic-preview">models · context · retrieval · tools · agents · integrations · cost and latency</span></span></summary><div class="stage-body"><div class="stage-group"><h3>What I want to understand</h3><div class="learning-item"><p>Know how the model fits into the larger application and where its context comes from. Be able to discuss retrieval, tools, agents, integrations, and production tradeoffs without treating implementation details as the goal.</p></div></div><div class="resource-row"><a class="resource-link" href="cheat-sheets/State_Learning_Cheat_Sheet_02_Anatomy_of_an_LLM_Application.pdf" target="_blank" rel="noopener noreferrer">LLM application anatomy</a></div></div></details>

        <details class="learning-stage" id="data-knowledge-context"><summary><span class="stage-num">04</span><span class="stage-main"><b>Data, Knowledge &amp; Context</b><small>Make sure the system has the right information and knows what should be trusted.</small><span class="topic-preview">source authority · retrieval · freshness · context · data quality · permissions</span></span></summary><div class="stage-body"><div class="stage-group"><h3>What I want to understand</h3><div class="learning-item"><p>Know what information the AI needs, where it comes from, and who owns it. Distinguish finding relevant information from deciding which source is current and authoritative.</p></div></div></div></details>

        <details class="learning-stage" id="quality-evals"><summary><span class="stage-num">05</span><span class="stage-main"><b>Quality, Evals &amp; Reliability</b><small>Define what good behavior means and find out why the system fails.</small><span class="topic-preview">evals · failure analysis · tracing · regression · monitoring · safe failure</span></span></summary><div class="stage-body"><div class="stage-group"><h3>What I want to understand</h3><div class="learning-item"><p>Turn product expectations into useful tests. Diagnose the failing layer before changing the system, protect important behavior with regression coverage, and keep checking quality after launch.</p></div></div><div class="resource-row"><a class="resource-link" href="cheat-sheets/AI_Product_Evals_Cheat_Sheet.pdf" target="_blank" rel="noopener noreferrer">AI Product Evals Cheat Sheet</a><a class="resource-link" href="cheat-sheets/Claude_Managed_Agents_Tracing_Cheat_Sheet.pdf" target="_blank" rel="noopener noreferrer">Managed agents + tracing</a></div></div></details>

        <details class="learning-stage" id="governance-control"><summary><span class="stage-num">06</span><span class="stage-main"><b>Governance, Risk &amp; Human Control</b><small>Decide what AI may do and where authority must stay elsewhere.</small><span class="topic-preview">permissions · human review · consequential actions · privacy · auditability · recovery</span></span></summary><div class="stage-body"><div class="stage-group"><h3>What I want to understand</h3><div class="learning-item"><p>Set clear decision rights around what the model may infer or recommend, what software must enforce, and what still requires a person. Match controls to the consequence of being wrong rather than adding blanket oversight.</p></div></div></div></details>

        <details class="learning-stage" id="implementation-adoption"><summary><span class="stage-num">07</span><span class="stage-main"><b>AI UX, Implementation &amp; Adoption</b><small>Design the human side of the workflow and make the change usable in practice.</small><span class="topic-preview">human/AI workflow · review UX · pilots · rollout · trust · enablement · operational ownership</span></span></summary><div class="stage-body"><div class="stage-group"><h3>What I want to understand</h3><div class="learning-item"><p>Design how people and AI divide the work, especially around review and recovery. Plan pilots and rollout around real workflow change, then diagnose whether weak adoption comes from training, trust, product friction, or a poor fit.</p></div></div></div></details>

        <details class="learning-stage" id="measurement-business"><summary><span class="stage-num">08</span><span class="stage-main"><b>Business Value &amp; Continuous Improvement</b><small>Measure whether the AI is creating enough value to justify keeping it.</small><span class="topic-preview">baselines · outcome metrics · ROI · operating cost · post-launch review · expand/change/stop</span></span></summary><div class="stage-body"><div class="stage-group"><h3>What I want to understand</h3><div class="learning-item"><p>Connect usage and quality to an actual business outcome. Include the human work and operating cost around the AI, then use production evidence to decide whether to expand, change, replace, or stop.</p></div></div></div></details>

        <details class="learning-stage" id="consulting-edge"><summary><span class="stage-num">09</span><span class="stage-main"><b>AI Consulting &amp; Professional Edge</b><small>Turn ambiguous AI interest into useful client and product decisions.</small><span class="topic-preview">client discovery · expectation setting · recommendations · vendor landscape · emerging patterns</span></span></summary><div class="stage-body"><div class="stage-group"><h3>What I want to understand</h3><div class="learning-item"><p>Ask the questions that turn “we need AI” into a concrete business problem. Explain technical tradeoffs simply, manage uncertainty without overselling, and stay current enough on the market to guide decisions without making specific tools the center of the work.</p></div></div><div class="resource-row"><a class="resource-link" href="ai-professional-edge.html" target="_blank" rel="noopener">AI Professional Edge</a></div></div></details>
      </section>
      <section aria-labelledby="building-next-heading" class="learning-next">
        <div class="section-kicker"><span>Working style</span></div>
        <h2 id="building-next-heading">How I’m using this.</h2>
        <p class="section-lead">I do not work through these areas in a fixed order. Projects expose gaps, and this map helps me notice what I have been neglecting. I use separate exercises and references when an area needs more depth.</p>
        <div class="learning-how-note"><strong>Working effectively with AI as a collaborator</strong><p>I give AI a specific job and the context it needs, then separate exploration from implementation and review. I keep responsibility for product judgment and consequential decisions.</p><div class="resource-row"><a class="resource-link" href="cheat-sheets/State_Learning_Cheat_Sheet_06_Building_Software_with_AI.pdf" target="_blank" rel="noopener noreferrer">Building software with AI</a></div></div>
      </section>
      <section aria-label="Deeper learning resources" class="site-go-deeper band"><h3>Go deeper</h3><p class="section-lead" style="margin-bottom:0">Optional references for topics that deserve more depth.</p><div class="resource-row"><a class="resource-link" href="https://academy.claude.com/" rel="noopener noreferrer" target="_blank">Anthropic Academy</a><a class="resource-link" href="https://www.anthropic.com/learn/claude-for-work" rel="noopener noreferrer" target="_blank">Claude for Work</a><a class="resource-link" href="https://docs.anthropic.com/" rel="noopener noreferrer" target="_blank">Anthropic docs</a></div></section>
    `;
  }

  const home=root.querySelector('[data-page="home"]');
  if(home){
    const ending=home.querySelector('.home-quiet-ending');
    if(ending){
      const h2=ending.querySelector('h2');
      const p=ending.querySelector('p');
      if(h2)h2.textContent='Backed by an ongoing learning system';
      if(p)p.textContent='I use a compact coverage map to make sure I keep practicing the business, product, technical, reliability, adoption, and value sides of AI work.';
    }
    const support=[...home.querySelectorAll('.home-supporting-row a')];
    support.forEach(card=>{
      const href=card.getAttribute('href');const span=card.querySelector('span');if(!span)return;
      if(href==='state-testing-debugging.html')span.textContent='Hands-on QA and failure diagnosis across the full AI system';
      if(href==='state-ai-evals.html')span.textContent='Defining product-specific quality bars and release-blocking failures';
      if(href==='meridian.html')span.textContent='Discovery and measurement in a simulated support pilot';
    });
  }

  const portfolio=root.querySelector('[data-page="portfolio"]');
  if(portfolio){
    const copy={
      'state-testing-debugging.html':'How I used hands-on QA and AI-assisted coverage to find the actual failure layer instead of treating every bad result as a prompt problem.',
      'state-managed-agent-tracing.html':'A controlled agent exercise where tracing showed that retrieval worked but the agent overstated what the evidence established.',
      'state-ai-evals.html':'How I turned State’s failure risks into product-specific quality bars and used the results to decide what needed fixing.',
      'state-architecture-cost.html':'What the working product changed about my assumptions on architecture, cost, and where AI should stay out of the system.',
      'meridian.html':'A simulated support pilot focused on the discovery questions and measurements that actually changed the design.'
    };
    portfolio.querySelectorAll('.applied-secondary-grid a').forEach(card=>{const p=card.querySelector('.card-intro');const text=copy[card.getAttribute('href')];if(p&&text)p.textContent=text;});
  }
})();
