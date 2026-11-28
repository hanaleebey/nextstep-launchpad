-- LOCAL REVIEW FIXTURE ONLY. Never load this file into a production project.
-- Owner UUID has no corresponding Auth login. See README "Database seed" to
-- assign these public rows to an account you create. No auth tables are changed.
-- Stable IDs + ON CONFLICT DO NOTHING preserve progress on repeat seed runs.
BEGIN;

INSERT INTO public.users_settings (user_id, weekly_available_hours, timezone, display_name)
VALUES ('00000000-0000-4000-8000-00000000d001', 10, 'UTC', 'Demo Student')
ON CONFLICT DO NOTHING;

INSERT INTO public.courses (id, user_id, lms_course_id, name, code) VALUES
('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000d001', 'demo-cs', 'Data Structures and Algorithms', 'CS 340'),
('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-00000000d001', 'demo-psy', 'Introduction to Psychology', 'PSY 101'),
('00000000-0000-4000-8000-00000000c003', '00000000-0000-4000-8000-00000000d001', 'demo-eng', 'Academic Writing', 'ENG 210'),
('00000000-0000-4000-8000-00000000c004', '00000000-0000-4000-8000-00000000d001', 'demo-mkt', 'Principles of Marketing', 'MKT 210')
ON CONFLICT DO NOTHING;

INSERT INTO public.assignments
(id, user_id, course_id, lms_assignment_id, title, due_at, estimated_minutes, estimate_source, actual_minutes, progress_pct, buffer_state, status) VALUES
('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c001', 'demo-hash', 'Hash map: implement collision handling and tests', now() + interval '10 hours', 360, 'allocated', 40, 25, 'red', 'in_progress'),
('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c002', 'demo-video-conditioning', 'Watch classical conditioning (4 minutes)', now() + interval '2 days', 4, 'signal', 0, 0, 'green', 'todo'),
('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c004', 'demo-video-brand', 'Watch brand positioning (18 minutes)', now() + interval '4 days', 18, 'signal', 0, 0, 'green', 'todo'),
('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c002', 'demo-read-memory', 'Read memory chapter: sections 1–3 (6,000 words)', now() + interval '18 hours', 30, 'signal', 10, 33, 'amber', 'in_progress'),
('00000000-0000-4000-8000-00000000a005', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c003', 'demo-read-argument', 'Read arguments: pages 1–9 (3,600 words)', now() + interval '3 days', 18, 'signal', 0, 0, 'green', 'todo'),
('00000000-0000-4000-8000-00000000a006', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c001', 'demo-quiz-graphs', 'Graph traversal quiz: 30-minute limit', now() + interval '5 days', 30, 'signal', 0, 0, 'green', 'todo'),
('00000000-0000-4000-8000-00000000a007', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c002', 'demo-quiz-learning', 'Learning quiz: 12 questions, no time limit', now() + interval '6 days', 18, 'signal', 0, 0, 'green', 'todo'),
('00000000-0000-4000-8000-00000000a008', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c004', 'demo-case-patagonia', 'Patagonia case: compare two positioning strategies', now() + interval '8 days', 120, 'allocated', 30, 25, 'green', 'in_progress'),
('00000000-0000-4000-8000-00000000a009', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c003', 'demo-essay', 'Argument essay: thesis, two sources and counterargument', now() + interval '14 days', 150, 'allocated', 0, 0, 'green', 'todo'),
('00000000-0000-4000-8000-00000000a010', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c002', 'demo-proposal', 'Memory research proposal: question, method and ethics', now() + interval '21 days', 90, 'allocated', 0, 0, 'green', 'todo'),
('00000000-0000-4000-8000-00000000a011', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c004', 'demo-discussion', 'Pricing discussion: 300 words and one peer reply', now() + interval '7 days', 30, 'signal', 0, 0, 'green', 'todo')
ON CONFLICT DO NOTHING;

INSERT INTO public.steps (id, assignment_id, order_index, title, timebox_minutes, done_criteria, status, scheduled_date) VALUES
('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000a001', 0, 'Define hash map insert and lookup interfaces', 40, '["Insert and lookup signatures are written", "Empty-map lookup has a specified result"]', 'done', current_date),
('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-00000000a001', 1, 'Implement collision handling with linked buckets', 50, '["Two keys sharing a bucket can both be retrieved"]', 'blocked', current_date),
('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-00000000a001', 2, 'Test resizing and duplicate-key replacement', 50, '["Resize preserves inserted keys", "Replacing a key does not add a duplicate"]', 'todo', current_date),
('00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-00000000a001', 3, 'Submit hash map code with test results', 20, '["Code and test output are included in the submission"]', 'todo', current_date),
('00000000-0000-4000-8000-00000000b005', '00000000-0000-4000-8000-00000000a002', 0, 'Watch classical conditioning', 4, '["Watched the four-minute video to the end"]', 'todo', current_date + 1),
('00000000-0000-4000-8000-00000000b006', '00000000-0000-4000-8000-00000000a003', 0, 'Watch brand positioning', 18, '["Watched the eighteen-minute lecture to the end"]', 'todo', current_date + 3),
('00000000-0000-4000-8000-00000000b007', '00000000-0000-4000-8000-00000000a004', 0, 'Read memory section 1: encoding', 10, '["Section 1 is read", "One encoding example is noted"]', 'done', current_date),
('00000000-0000-4000-8000-00000000b008', '00000000-0000-4000-8000-00000000a004', 1, 'Read memory section 2: storage', 10, '["Section 2 is read", "Short-term and long-term storage are distinguished"]', 'todo', current_date),
('00000000-0000-4000-8000-00000000b009', '00000000-0000-4000-8000-00000000a004', 2, 'Read memory section 3: retrieval', 10, '["Section 3 is read", "One retrieval cue is noted"]', 'todo', current_date),
('00000000-0000-4000-8000-00000000b010', '00000000-0000-4000-8000-00000000a005', 0, 'Read argument pages 1–3', 6, '["Pages 1–3 are read", "Main claim is underlined"]', 'todo', current_date + 1),
('00000000-0000-4000-8000-00000000b011', '00000000-0000-4000-8000-00000000a005', 1, 'Read argument pages 4–6', 6, '["Pages 4–6 are read", "Supporting evidence is identified"]', 'todo', current_date + 1),
('00000000-0000-4000-8000-00000000b012', '00000000-0000-4000-8000-00000000a005', 2, 'Read argument pages 7–9', 6, '["Pages 7–9 are read", "Counterargument is noted"]', 'todo', current_date + 2),
('00000000-0000-4000-8000-00000000b013', '00000000-0000-4000-8000-00000000a006', 0, 'Trace breadth-first and depth-first traversal', 10, '["Both traversals are traced on one example graph"]', 'todo', current_date + 3),
('00000000-0000-4000-8000-00000000b014', '00000000-0000-4000-8000-00000000a006', 1, 'Take the graph traversal quiz', 30, '["Quiz submitted within its thirty-minute limit"]', 'todo', current_date + 4),
('00000000-0000-4000-8000-00000000b015', '00000000-0000-4000-8000-00000000a007', 0, 'Distinguish classical and operant conditioning', 10, '["One example of each conditioning type is written"]', 'todo', current_date + 4),
('00000000-0000-4000-8000-00000000b016', '00000000-0000-4000-8000-00000000a007', 1, 'Answer the twelve learning quiz questions', 18, '["All twelve answers are submitted"]', 'todo', current_date + 5),
('00000000-0000-4000-8000-00000000b017', '00000000-0000-4000-8000-00000000a008', 0, 'Identify Patagonia positioning evidence', 30, '["Two positioning claims have supporting case evidence"]', 'done', current_date + 1),
('00000000-0000-4000-8000-00000000b018', '00000000-0000-4000-8000-00000000a008', 1, 'Compare two Patagonia positioning strategies', 40, '["Both strategies are compared against the same customer segment"]', 'todo', current_date + 2),
('00000000-0000-4000-8000-00000000b019', '00000000-0000-4000-8000-00000000a008', 2, 'Write the strategy recommendation', 40, '["Recommendation names one strategy and cites the case evidence"]', 'todo', current_date + 3),
('00000000-0000-4000-8000-00000000b020', '00000000-0000-4000-8000-00000000a008', 3, 'Submit the Patagonia comparison', 10, '["Comparison and recommendation are uploaded"]', 'todo', current_date + 4),
('00000000-0000-4000-8000-00000000b021', '00000000-0000-4000-8000-00000000a009', 0, 'Write the argument essay thesis', 25, '["Thesis takes a position that can be supported by evidence"]', 'todo', current_date + 1),
('00000000-0000-4000-8000-00000000b022', '00000000-0000-4000-8000-00000000a009', 1, 'Draft support using two cited sources', 50, '["Two sources are cited in the supporting paragraphs"]', 'todo', current_date + 2),
('00000000-0000-4000-8000-00000000b023', '00000000-0000-4000-8000-00000000a009', 2, 'Address the strongest counterargument', 50, '["A counterargument and response are included"]', 'todo', current_date + 3),
('00000000-0000-4000-8000-00000000b024', '00000000-0000-4000-8000-00000000a009', 3, 'Submit the argument essay draft', 25, '["Thesis, sources and counterargument are in the uploaded draft"]', 'todo', current_date + 4),
('00000000-0000-4000-8000-00000000b025', '00000000-0000-4000-8000-00000000a010', 0, 'State the memory research question', 20, '["Research question names a memory process and population"]', 'todo', current_date + 1),
('00000000-0000-4000-8000-00000000b026', '00000000-0000-4000-8000-00000000a010', 1, 'Describe the proposed memory experiment', 30, '["Method names a measure and comparison condition"]', 'todo', current_date + 2),
('00000000-0000-4000-8000-00000000b027', '00000000-0000-4000-8000-00000000a010', 2, 'Write consent and privacy safeguards', 30, '["Consent and participant privacy are addressed"]', 'todo', current_date + 3),
('00000000-0000-4000-8000-00000000b028', '00000000-0000-4000-8000-00000000a010', 3, 'Submit the research proposal', 10, '["Question, method and ethics are included"]', 'todo', current_date + 4),
('00000000-0000-4000-8000-00000000b029', '00000000-0000-4000-8000-00000000a011', 0, 'Choose a pricing example and state its strategy', 10, '["A named product and its pricing strategy are described"]', 'todo', current_date + 3),
('00000000-0000-4000-8000-00000000b030', '00000000-0000-4000-8000-00000000a011', 1, 'Write the 300-word pricing discussion', 15, '["Post contains at least three hundred words and explains the example"]', 'todo', current_date + 4),
('00000000-0000-4000-8000-00000000b031', '00000000-0000-4000-8000-00000000a011', 2, 'Reply to one peer with a pricing comparison', 5, '["One peer receives a reply comparing the pricing strategies"]', 'todo', current_date + 5)
ON CONFLICT DO NOTHING;

INSERT INTO public.detected_items
(id, user_id, assignment_id, item_type, title, source_course, signal_value, estimated_minutes, confidence, confirmed, details) VALUES
('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a001', 'paper', 'Hash map', 'CS 340', 'weekly allocation', 360, 'low', true, 'Implement insert, lookup, collision handling, resizing, replacement and tests.'),
('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a002', 'video', 'Classical conditioning', 'PSY 101', 'video duration: 240s', 4, 'high', true, 'Watch the four-minute classical conditioning video.'),
('00000000-0000-4000-8000-00000000e003', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a003', 'video', 'Brand positioning', 'MKT 210', 'video duration: 1080s', 18, 'high', true, 'Watch the eighteen-minute brand positioning lecture.'),
('00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a004', 'read', 'Memory chapter', 'PSY 101', 'word count: 6000', 30, 'medium', true, 'Read sections 1–3 on encoding, storage and retrieval. Note one example for each.'),
('00000000-0000-4000-8000-00000000e005', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a005', 'read', 'Argument reading', 'ENG 210', 'word count: 3600', 18, 'medium', true, 'Read pages 1–9; identify the claim, supporting evidence and counterargument.'),
('00000000-0000-4000-8000-00000000e006', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a006', 'quiz', 'Graph traversal', 'CS 340', 'quiz time limit: 1800s', 30, 'high', true, 'Trace BFS and DFS, then take the thirty-minute quiz.'),
('00000000-0000-4000-8000-00000000e007', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a007', 'quiz', 'Learning quiz', 'PSY 101', 'question count: 12', 18, 'medium', true, 'Twelve untimed questions on classical and operant conditioning.'),
('00000000-0000-4000-8000-00000000e008', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a008', 'paper', 'Patagonia comparison', 'MKT 210', 'weekly allocation', 120, 'low', true, 'Compare two positioning strategies using case evidence and recommend one.'),
('00000000-0000-4000-8000-00000000e009', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a009', 'paper', 'Argument essay', 'ENG 210', 'weekly allocation', 150, 'low', true, 'Write a thesis, cite two sources and address a counterargument.'),
('00000000-0000-4000-8000-00000000e010', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a010', 'paper', 'Memory proposal', 'PSY 101', 'weekly allocation', 90, 'low', true, 'State a research question, describe the experiment and address consent and privacy.'),
('00000000-0000-4000-8000-00000000e011', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a011', 'post', 'Pricing discussion', 'MKT 210', 'discussion requirements', 30, 'low', true, 'Write three hundred words about a product pricing strategy and reply to one peer.')
ON CONFLICT DO NOTHING;

INSERT INTO public.weekly_allocations (id, user_id, assignment_id, week_start, allocated_minutes) VALUES
('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a001', date_trunc('week', now())::date, 360),
('00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a008', date_trunc('week', now())::date, 30),
('00000000-0000-4000-8000-00000000f003', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a009', date_trunc('week', now())::date, 30),
('00000000-0000-4000-8000-00000000f004', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a010', date_trunc('week', now())::date, 30)
ON CONFLICT DO NOTHING;

INSERT INTO public.estimate_events (id, assignment_id, item_type, estimated_minutes, actual_minutes, confidence, calibration_used) VALUES
('00000000-0000-4000-8000-000000009001', '00000000-0000-4000-8000-00000000a004', 'reading', 10, 12, 'medium', true),
('00000000-0000-4000-8000-000000009002', '00000000-0000-4000-8000-00000000a004', 'reading', 10, 11, 'medium', true),
('00000000-0000-4000-8000-000000009003', '00000000-0000-4000-8000-00000000a005', 'reading', 10, 12, 'medium', true),
('00000000-0000-4000-8000-000000009004', '00000000-0000-4000-8000-00000000a008', 'writing', 30, 36, 'low', true),
('00000000-0000-4000-8000-000000009005', '00000000-0000-4000-8000-00000000a009', 'writing', 30, 33, 'low', true),
('00000000-0000-4000-8000-000000009006', '00000000-0000-4000-8000-00000000a010', 'writing', 30, 36, 'low', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.calibration_multipliers (user_id, item_type, multiplier, sample_count) VALUES
('00000000-0000-4000-8000-00000000d001', 'reading', 1.10, 3),
('00000000-0000-4000-8000-00000000d001', 'writing', 1.10, 3)
ON CONFLICT DO NOTHING;

INSERT INTO public.activity_log (id, user_id, kind, message) VALUES
('00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-00000000d001', 'sync', 'Local fixture loaded: four courses and eleven assignments; no Moodle request was made.'),
('00000000-0000-4000-8000-000000008002', '00000000-0000-4000-8000-00000000d001', 'replan', 'Demo collision-handling step is blocked. The urgent hash map needs attention before its deadline.'),
('00000000-0000-4000-8000-000000008003', '00000000-0000-4000-8000-00000000d001', 'calibrate', 'Demo reading and writing multipliers use three historical samples each.')
ON CONFLICT DO NOTHING;
COMMIT;