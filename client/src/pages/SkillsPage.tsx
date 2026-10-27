import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import type { ConceptPracticeRecord, JourneyPathResponse, PracticeRecordResponse } from "../api/types.js";
import { MissionPanel } from "../components/MissionPanel.js";
import { withCode } from "../components/CodeText.js";
import {
    ACCURACY_FROM,
    NEEDS_PRACTICE_AT_MOST,
    RECENT,
    SKILL_STATE_LABEL,
    TREND_STEP,
    skillSummary,
    skillTopics,
    type Skill,
    type SkillState,
    type SkillTopic
} from "../games/skills.js";
import { usePageTitle } from "../usePageTitle.js";
import { Icon, type IconName } from "../world/Icon.js";

/**
 * THE SKILLS HUB: what you can do, what you are practising, and the one thing
 * worth doing next.
 *
 * Three parts, and nothing here is computed beyond what the server records
 * (see games/skills.ts):
 *
 *     the skill tree      every concept on the course, topic by topic, along a
 *                         winding path, each with one of four honest states
 *     the summary         strengths (shown without a retry) and practise-next
 *     one recommendation  the same mission Home shows -- the path's next step
 *
 * Selecting a skill opens its details directly below its topic: what it is, its
 * state in words, its stops, and where to work on it. A locked skill says what
 * opens it rather than offering a way in.
 *
 * THE TREE IS THE COURSE ORDER, NOT A PREREQUISITE GRAPH. The path response does
 * not carry prerequisites, so the tree draws no branches it cannot back up;
 * optional branches would need that data from the server first.
 */

const STATE_ICON: Record<SkillState, IconName> = {
    demonstrated: "check",
    practised: "spark",
    learning: "arrow",
    locked: "lock"
};

export function SkillsPage() {
    usePageTitle("Skills");
    const [path, setPath] = useState<JourneyPathResponse | null>(null);
    /** The practice record, or null when it did not load: then the page says
     *  nothing about attempts rather than showing zeros it does not know. */
    const [record, setRecord] = useState<ConceptPracticeRecord[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let active = true;

        // Together, so the page renders once with both: the record is only
        // ever extra detail, so its failure is not the page's.
        Promise.all([
            api.get<JourneyPathResponse>("/api/curriculum/path"),
            api.get<PracticeRecordResponse>("/api/curriculum/practice-record").catch(() => null)
        ])
            .then(([data, practice]) => {
                if (!active) return;
                setRecord(practice?.concepts ?? null);
                setPath(data);
            })
            .catch(() => active && setFailed(true));

        return () => {
            active = false;
        };
    }, [attempt]);

    if (failed) {
        return (
            <section className="skills">
                <h1 className="skills-title">Your skills</h1>
                <p role="alert">Your skills did not load. Nothing is lost.</p>
                <button
                    className="button primary"
                    onClick={() => {
                        setFailed(false);
                        setAttempt((n) => n + 1);
                    }}
                >
                    Try again
                </button>
            </section>
        );
    }

    if (!path) {
        return (
            <p className="muted center" role="status">
                Loading your skills…
            </p>
        );
    }

    return <SkillsHub path={path} record={record} />;
}

function SkillsHub({ path, record }: { path: JourneyPathResponse; record: ConceptPracticeRecord[] | null }) {
    const topics = skillTopics(path, record);
    const summary = skillSummary(path, record);
    const [selected, setSelected] = useState<string | null>(null);
    /** Locked topics start folded: a long list of padlocks says nothing. */
    const [unfolded, setUnfolded] = useState<Set<string>>(new Set());

    const toggleTopic = (slug: string) =>
        setUnfolded((prev) => {
            const next = new Set(prev);
            if (next.has(slug)) next.delete(slug);
            else next.add(slug);
            return next;
        });

    return (
        <section className="skills">
            <header className="skills-head">
                <h1 className="skills-title">Your skills</h1>
                <p className="skills-lede">
                    Every JavaScript skill on the course, in the order you learn them. Pick one to see
                    where it stands.
                </p>
                {summary.answered && summary.answered.attempts > 0 && (
                    <p className="skills-answered">
                        You have answered <strong>{summary.answered.attempts}</strong> practice{" "}
                        {summary.answered.attempts === 1 ? "question" : "questions"} across{" "}
                        <strong>{summary.answered.skills}</strong>{" "}
                        {summary.answered.skills === 1 ? "skill" : "skills"}, {summary.answered.correct} of them right.
                    </p>
                )}
                <ul className="skills-legend" aria-label="What the states mean">
                    {(["demonstrated", "practised", "learning", "locked"] as const).map((state) => (
                        <li key={state} className={`skill-chip is-${state}`}>
                            <Icon name={STATE_ICON[state]} size={16} /> {SKILL_STATE_LABEL[state]}
                            <span className="skills-legend-count">{summary.counts[state]}</span>
                        </li>
                    ))}
                </ul>
                <HowWorkedOut />
            </header>

            <div className="skills-layout">
                <ol className="skill-tree" aria-label="Skill tree">
                    {topics.map((topic, i) => (
                        <TopicStop
                            key={topic.slug}
                            topic={topic}
                            side={i % 2 === 0 ? "left" : "right"}
                            folded={topic.state === "locked" && !unfolded.has(topic.slug)}
                            onToggle={() => toggleTopic(topic.slug)}
                            selected={selected}
                            onSelect={(slug) => setSelected((cur) => (cur === slug ? null : slug))}
                        />
                    ))}
                </ol>

                <aside className="skills-summary" aria-label="Summary">
                    <section className="skills-card">
                        <h2 className="skills-card-title">Strengths</h2>
                        {summary.strengths.length > 0 ? (
                            <ul className="skills-list">
                                {summary.strengths.map((s) => (
                                    <li key={s.slug}>
                                        <Icon name="check" size={16} /> {withCode(s.name)}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="skills-empty">
                                Nothing shown yet. Demonstrate your first skill and it appears here.
                            </p>
                        )}
                    </section>

                    <section className="skills-card">
                        <h2 className="skills-card-title">Practise next</h2>
                        {summary.practiseNext.length > 0 ? (
                            <ul className="skills-list">
                                {summary.practiseNext.map(({ skill, why }) => (
                                    <li key={skill.slug}>
                                        <Link to={skill.href ?? "/journey"}>{withCode(skill.name)}</Link>
                                        <span className="skills-why">{why}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="skills-empty">Nothing waiting. Every open skill is shown.</p>
                        )}
                    </section>

                    {/* One recommendation: the path's own next step, the same
                        mission Home shows. */}
                    <MissionPanel path={path} className="skills-mission" />
                </aside>
            </div>
        </section>
    );
}

function TopicStop({
    topic,
    side,
    folded,
    onToggle,
    selected,
    onSelect
}: {
    topic: SkillTopic;
    side: "left" | "right";
    folded: boolean;
    onToggle: () => void;
    selected: string | null;
    onSelect: (slug: string) => void;
}) {
    const chosen = topic.skills.find((s) => s.slug === selected) ?? null;
    const listId = `skills-${topic.slug}`;

    return (
        <li className={`skill-topic is-${topic.state} is-${side}`}>
            <div className="skill-topic-head">
                <h2 className="skill-topic-name">{topic.name}</h2>
                <p className="skill-topic-count">
                    {topic.demonstrated} of {topic.skills.length} shown
                    {topic.state === "locked" && " · locked"}
                </p>
                {topic.state === "locked" && (
                    <button
                        type="button"
                        className="skill-topic-toggle"
                        aria-expanded={!folded}
                        aria-controls={listId}
                        onClick={onToggle}
                    >
                        {folded ? "Show skills" : "Hide skills"}
                    </button>
                )}
            </div>

            {!folded && (
                <ul className="skill-nodes" id={listId}>
                    {topic.skills.map((skill) => (
                        <li key={skill.slug}>
                            <button
                                type="button"
                                className={`skill-node is-${skill.state}${selected === skill.slug ? " is-selected" : ""}${skill.practice?.needsPractice ? " needs-practice" : ""}`}
                                aria-expanded={selected === skill.slug}
                                aria-controls={`skill-detail-${topic.slug}`}
                                onClick={() => onSelect(skill.slug)}
                            >
                                <Icon name={STATE_ICON[skill.state]} size={16} />
                                <span className="skill-node-name">{withCode(skill.name)}</span>
                                <span className="visually-hidden">, {SKILL_STATE_LABEL[skill.state]}</span>
                                {skill.practice?.needsPractice && (
                                    <span className="skill-node-flag">
                                        <span aria-hidden="true">!</span>
                                        <span className="visually-hidden">, needs more practice</span>
                                    </span>
                                )}
                            </button>
                        </li>
                    ))}
                    {topic.checkpoint && (
                        <li>
                            <span className={`skill-node is-checkpoint is-${topic.checkpoint.state}`}>
                                <Icon name={topic.checkpoint.state === "demonstrated" ? "check" : "spark"} size={16} />
                                <span className="skill-node-name">Checkpoint</span>
                                <span className="visually-hidden">
                                    ,{" "}
                                    {topic.checkpoint.state === "demonstrated"
                                        ? "passed"
                                        : topic.checkpoint.state === "current"
                                          ? "ready to take"
                                          : "locked"}
                                </span>
                            </span>
                        </li>
                    )}
                </ul>
            )}

            <div id={`skill-detail-${topic.slug}`} aria-live="polite">
                {chosen && <SkillDetail skill={chosen} />}
            </div>
        </li>
    );
}

function SkillDetail({ skill }: { skill: Skill }) {
    return (
        <div className={`skill-detail is-${skill.state}`}>
            <p className="skill-detail-state">
                <Icon name={STATE_ICON[skill.state]} size={16} /> {SKILL_STATE_LABEL[skill.state]}
                {skill.state === "demonstrated" && skill.neededRetry && " · after a second try"}
            </p>
            <h3 className="skill-detail-name">{withCode(skill.name)}</h3>
            {skill.objective && <p className="skill-detail-goal">You can: {withCode(skill.objective)}.</p>}
            {skill.playable > 0 ? (
                <p className="skill-detail-stops">
                    {skill.cleared} of {skill.playable} {skill.playable === 1 ? "stop" : "stops"} cleared
                </p>
            ) : (
                <p className="skill-detail-stops">Taught in its lesson: no practice stops yet</p>
            )}
            {skill.practice && <PracticeLines skill={skill} />}

            {skill.href ? (
                <Link className="button primary skill-detail-action" to={skill.href}>
                    {skill.state === "demonstrated"
                        ? "Revisit the lesson"
                        : skill.state === "locked"
                          ? "Open the lesson"
                          : skill.cleared > 0
                            ? "Keep practising"
                            : "Start this skill"}
                </Link>
            ) : (
                <p className="skill-detail-reason">{skill.reason ?? "Not open yet"}</p>
            )}
        </div>
    );
}

/**
 * How the practice on one skill has gone, from the practice record. Every
 * line is a count of real answers; a line is left out when there are too few
 * to say it (games/skills.ts).
 */
function PracticeLines({ skill }: { skill: Skill }) {
    const p = skill.practice!;

    if (p.attempts === 0) {
        return (
            <p className="skill-detail-practice">
                {skill.state === "locked" ? "Nothing answered yet." : "Not started: nothing answered yet."}
            </p>
        );
    }

    return (
        <div className="skill-detail-practice">
            <p>
                Answered {p.attempts}, {p.correct} right
                {p.accuracy !== null && ` (${p.accuracy}%)`}
            </p>
            {p.needsPractice && p.recent && (
                <p className="skill-detail-flag">
                    <span aria-hidden="true">!</span> Needs more practice: {p.recent.correct} of your last{" "}
                    {p.recent.attempts} right
                </p>
            )}
            {/* A fall is not said twice: when the flag above already says the
                last five need work, the trend would only repeat it. */}
            {p.trend && !(p.trend.direction === "down" && p.needsPractice) && (
                <p>
                    {p.trend.direction === "up" ? "Improving" : "Lower lately"}: {p.trend.recent} of your last {RECENT} right,{" "}
                    {p.trend.direction === "up" ? "up" : "down"} from {p.trend.earlier} of the {RECENT} before
                </p>
            )}
        </div>
    );
}

/** The rules behind every number on this page, in one place. */
function HowWorkedOut() {
    return (
        <details className="skills-how">
            <summary>How these are worked out</summary>
            <ul>
                <li>
                    <strong>Demonstrated</strong>: every practice stop was cleared, then you showed the
                    skill in its lesson. It says you could do it then. It is not long-term mastery:
                    Jolt does not yet check that a skill holds over time.
                </li>
                <li>
                    <strong>Practised</strong>: at least one stop cleared. <strong>Learning now</strong>:
                    the skill you are on, nothing cleared yet.
                </li>
                <li>
                    <strong>Answered</strong> counts every graded answer on a question, bug or Flush
                    puzzle tagged to the skill, from Code Blitz, Bug Hunt and Flush. A timed-out
                    question counts as not right, and a bug counts as right only when your first
                    patch fixed it. Lessons and Reaction and Memory are not counted.
                </li>
                <li>
                    A percentage appears from {ACCURACY_FROM} answers. <strong>Needs more practice</strong>{" "}
                    means {NEEDS_PRACTICE_AT_MOST} or fewer of your last {RECENT} were right. A trend
                    appears once there are {RECENT * 2} answers and the last {RECENT} differ from the{" "}
                    {RECENT} before by {TREND_STEP} or more. A locked skill shows only its counts:
                    it cannot be practised yet.
                </li>
            </ul>
        </details>
    );
}
