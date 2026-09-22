-- Expand the question topic taxonomy to match the current curriculum.
-- Keep `conditionals` temporarily because existing questions still use it.
-- The conditionals → control-flow migration will happen separately.

ALTER TABLE questions
DROP CONSTRAINT questions_topic_valid;

ALTER TABLE questions
ADD CONSTRAINT questions_topic_valid
CHECK (
    topic IN (
        'values',
        'variables',
        'operators',
        'control-flow',
        'strings',
        'loops',
        'functions',
        'scope',
        'arrays',
        'array-methods',
        'objects',
        'errors',
        'dom',
        'async',
        'this-and-classes',
        'algorithms',
        'conditionals'
    )
);