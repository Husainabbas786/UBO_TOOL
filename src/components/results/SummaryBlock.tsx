import {
  formatPercent,
  type CalculationResult,
  type ExcludedController,
  type ExcludedRoleHolder,
  type NomineeArrangement,
  type RecordedRoleHolder,
  type RelatedPartyGroup,
  type UboSummaryEntry,
} from '../../engine'

/** "A", "A and B", "A, B and C". */
function listOf(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * How a beneficial owner qualifies, in words.
 *
 * Someone who qualifies on anything other than a percentage needs to be told
 * what carried them there — which company they control, which trust they hold a
 * role in — otherwise the line reads as a 0% owner and means nothing to a
 * reviewer. The clauses compose, because a person can qualify on more than one.
 */
function describeBasis(ubo: UboSummaryEntry, result: CalculationResult): string {
  const targetName = result.target.name
  const clauses: string[] = []

  if (ubo.basis.includes('Ownership')) {
    clauses.push(`holds ${formatPercent(ubo.totalPercent)}% of ${targetName}`)
  }

  if (ubo.roles.length > 0) {
    /*
     * A role held through a company reads the long way round on purpose:
     * naming the company, this person's stake in it, and the structure's stake
     * in the Meydan FZ company. A reviewer has to be able to retrace the whole
     * route, and "Trustee of XYZ Trust" alone would hide the company entirely.
     */
    const describe = (claim: (typeof ubo.roles)[number]): string => {
      const ofTarget =
        claim.entityKey === result.target.key
          ? ''
          : `, which holds ${formatPercent(claim.effectivePercent)}% of ${targetName}`
      if (claim.via) {
        return `owner of ${formatPercent(claim.via.percentOfHolder)}% of ${claim.via.name}, ${claim.role} of ${claim.entityName}${ofTarget}`
      }
      return `${claim.role} of ${claim.entityName}${ofTarget}`
    }
    clauses.push(`is ${listOf(ubo.roles.map(describe))}`)
  }

  if (ubo.controls.length > 0) {
    clauses.push(`has control of ${listOf(ubo.controls)}`)
  }

  if (ubo.relatedGroupIds.length > 0 && !ubo.basis.includes('Ownership')) {
    const totals = result.relatedGroups
      .filter((group) => ubo.relatedGroupIds.includes(group.id))
      .map((group) => `${formatPercent(group.totalPercent)}%`)
    clauses.push(
      `holds ${formatPercent(ubo.totalPercent)}% of ${targetName}, within a related-party group totalling ${listOf(totals)}`,
    )
  }

  if (clauses.length === 0) {
    clauses.push(`holds ${formatPercent(ubo.totalPercent)}% of ${targetName}`)
  }

  return ` ${listOf(clauses)}`
}

/** "A (5.00%)", "A (5.00%) and B (3.00%)", "A (…), B (…) and C (…)". */
function listCompanies(companies: ExcludedController['companies']): string {
  return listOf(
    companies.map(
      (company) =>
        `${company.name} (${formatPercent(company.effectivePercent)}% of the Meydan FZ company)`,
    ),
  )
}

/**
 * Why a flagged controller was not counted. The chart badges everyone who was
 * flagged, so without this line a reviewer sees a Control badge on the chart
 * and finds nothing on the page explaining why it did not make them a UBO.
 */
function describeExclusion(entry: ExcludedController, threshold: number): string {
  const plural = entry.companies.length > 1
  return ` is flagged as controller of ${listCompanies(entry.companies)}, which ${
    plural ? 'are each' : 'is'
  } below the ${threshold}% threshold, so is not counted as a UBO.`
}

/** The same explanation for a role-holder whose trust or foundation falls short. */
function describeRoleExclusion(entry: ExcludedRoleHolder, threshold: number): string {
  const plural = entry.entities.length > 1
  const parts = entry.entities.map(
    (entity) =>
      `${entity.role} of ${entity.name} (${entity.kindLabel.toLowerCase()}, ${formatPercent(
        entity.effectivePercent,
      )}% of the Meydan FZ company)`,
  )
  return ` is ${listOf(parts)}, which ${
    plural ? 'are each' : 'is'
  } below the ${threshold}% threshold, so is not counted as a UBO.`
}

/**
 * One line per nominee arrangement, led by the person who actually owns it.
 *
 * The order carries the meaning. Starting with the nominee — "Dinesh holds
 * shares in ABC LTD" — reads as a shareholding of his own before the sentence
 * gets to the word "nominee", which is the opposite of what the arrangement
 * is: he holds nothing beneficially. So the nominator comes first as the
 * owner, and the nominee is named only as the person whose name is on the
 * register.
 *
 * "in the name of nominee X" rather than "in their name by nominee X": the
 * shares stand in the nominee's name, and a pronoun that far from its referent
 * would be read as the nominator's.
 */
export function describeNominee(entry: NomineeArrangement): string {
  return ` is the beneficial owner of the ${formatPercent(entry.percent)}% shareholding in ${
    entry.entityName
  } held in the name of nominee ${entry.nomineeName}.`
}

/**
 * A role-holder who was entered and deliberately not marked.
 *
 * The record has to show the judgement, not just its outcome: a council member
 * who was read and excluded is a different fact from one nobody entered.
 */
function describeRecorded(entry: RecordedRoleHolder): string {
  const parts = entry.entities.map(
    (entity) => `${entity.role} of ${entity.name} (${entity.kindLabel.toLowerCase()})`,
  )
  return ` is ${listOf(parts)}, recorded but not marked as a beneficial owner.`
}

/**
 * One line per group, in the wording Compliance asked for: who was combined,
 * what each holds, what it comes to, and why that crossed the line.
 */
function describeGroup(group: RelatedPartyGroup, threshold: number): string {
  const sum = group.members
    .map((member) => `${member.name} ${formatPercent(member.effectivePercent)}%`)
    .join(' + ')
  const heading = group.label === '' ? 'Related-party group' : `Related-party group (${group.label})`
  const verdict = group.qualifies
    ? `identified as UBOs (combined ownership meets the ${threshold}% threshold)`
    : `below the ${threshold}% threshold, so no UBO is added`
  return `${heading}: ${sum} = ${formatPercent(group.totalPercent)}% — ${verdict}.`
}

export function SummaryBlock({ result }: { result: CalculationResult }) {
  const count = result.ubos.length
  const groups = result.relatedGroups

  return (
    <div className="space-y-4">
      <p
        className={`rounded-card border px-4 py-3 text-body font-semibold ${
          count > 0
            ? 'border-mfzGreen bg-uboTint text-darkGreen'
            : 'border-fieldBorder bg-field text-navy'
        }`}
      >
        {count} beneficial owner{count === 1 ? '' : '(s)'} identified at the {result.threshold}%
        threshold
      </p>

      {count > 0 ? (
        <ul className="space-y-2 text-body text-ink">
          {result.ubos.map((ubo) => (
            <li key={ubo.key} className="flex flex-wrap items-baseline gap-x-2">
              <span>
                <span className="font-semibold text-navy">{ubo.name}</span>
                {describeBasis(ubo, result)}
              </span>
              <span
                className={`rounded-pill px-2 py-0.5 text-small font-medium ${
                  ubo.basis === 'Ownership' ? 'bg-uboTint text-darkGreen' : 'bg-purple text-white'
                }`}
              >
                {ubo.basis}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Who owns the shares is not always whose name is on them. The owner is
          already listed as a UBO above; this records the arrangement that put
          somebody else's name on the register, and says it in that order. */}
      {result.nominees.length > 0 ? (
        <div className="rounded-card border border-steelBlue bg-infoTint px-4 py-3">
          <p className="text-body font-semibold text-navy">Nominee arrangements</p>
          <ul className="mt-1.5 space-y-1 text-body text-navy">
            {result.nominees.map((entry) => (
              <li key={`${entry.nomineeKey}>${entry.entityKey}>${entry.nominatorKey}`}>
                <span className="font-semibold">{entry.nominatorName}</span>
                {describeNominee(entry)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Aggregation is a manual judgement, so it says exactly what was added
          together and what it came to — never just the conclusion. */}
      {groups.length > 0 ? (
        <div className="rounded-card border border-steelBlue bg-infoTint px-4 py-3">
          <p className="text-body font-semibold text-navy">Related-party aggregation</p>
          <ul className="mt-1.5 space-y-2 text-body text-navy">
            {groups.map((group) => (
              <li key={group.id}>
                {describeGroup(group, result.threshold)}
                {group.qualifies && group.qualifiedViaCompanyMember ? (
                  <span className="mt-0.5 block text-small text-navy">
                    The group only reaches the threshold once a company member&rsquo;s stake is
                    counted. A company is never itself a beneficial owner, so only the individual
                    members above are identified — check the ownership behind that company.
                  </span>
                ) : null}
                {group.overlaps ? (
                  <span className="mt-0.5 block text-small text-navy">
                    A company in this group sits on a member&rsquo;s own chain, so the same shares
                    are counted twice in the total above. Review before relying on it.
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* A badge on the chart with no explanation anywhere is exactly the gap
          this closes: say who was flagged, over what, and why it fell short. */}
      {result.excludedControllers.length > 0 || result.excludedRoleHolders.length > 0 ? (
        <div className="rounded-card border border-purple bg-purple-t10 px-4 py-3">
          <p className="text-body font-semibold text-purple">Flagged but not counted</p>
          <ul className="mt-1.5 space-y-1 text-body text-navy">
            {result.excludedControllers.map((entry) => (
              <li key={entry.key}>
                <span className="font-semibold">{entry.name}</span>
                {describeExclusion(entry, result.threshold)}
              </li>
            ))}
            {result.excludedRoleHolders.map((entry) => (
              <li key={`role-${entry.key}`}>
                <span className="font-semibold">{entry.name}</span>
                {describeRoleExclusion(entry, result.threshold)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Holding a role is not being a beneficial owner. These people were
          entered, read against the constitutional document and left unmarked —
          which is a judgement the file has to show, not an omission. */}
      {result.recordedRoleHolders.length > 0 ? (
        <div className="rounded-card border border-line bg-field px-4 py-3">
          <p className="text-body font-semibold text-navy">
            Role-holders recorded (not beneficial owners)
          </p>
          <ul className="mt-1.5 space-y-1 text-body text-navy">
            {result.recordedRoleHolders.map((entry) => (
              <li key={`recorded-${entry.key}`}>
                <span className="font-semibold">{entry.name}</span>
                {describeRecorded(entry)}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-small text-muted">
            A role does not by itself make anybody a beneficial owner. These role-holders were not
            marked as such, so they are reported and not counted.
          </p>
        </div>
      ) : null}

      {/* An office is not a shareholding. These people are named on the file
          because they run the company, and the heading has to say plainly that
          that is not what makes anybody a beneficial owner. */}
      {result.management.length > 0 ? (
        <div className="rounded-card border border-line bg-field px-4 py-3">
          <p className="text-body font-semibold text-navy">Management (not beneficial owners)</p>
          <p className="mt-1.5 text-body text-navy">
            {result.management
              .map((person) => `${person.name} — ${person.designation}`)
              .join('; ')}
          </p>
          <p className="mt-1.5 text-small text-muted">
            Directors, managers and authorised persons of {result.target.name}. Holding one of
            these offices is not in itself beneficial ownership, and none of them affect the
            figures above.
          </p>
        </div>
      ) : null}

      {/* The chain stops at a company nobody owns on paper: say so plainly. */}
      {result.unidentified.length > 0 ? (
        <div className="rounded-card border border-coral bg-gapTint px-4 py-3">
          <p className="text-body font-semibold text-coral">Beneficial owner unidentified</p>
          <ul className="mt-1.5 space-y-1 text-body text-coral">
            {result.unidentified.map((gap) => (
              <li key={gap.key}>
                {formatPercent(gap.effectivePercent)}% of {result.target.name} traces to {gap.name},
                whose owners have not been entered. Beneficial owner unidentified.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-small text-muted">
        Considered {result.entityCount} entities and {result.pathCount} ownership paths. Multiple
        paths for the same owner are aggregated.
      </p>
    </div>
  )
}
