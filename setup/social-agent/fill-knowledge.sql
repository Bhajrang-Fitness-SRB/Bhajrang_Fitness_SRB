-- Teach the agent your REAL details. Edit the text between the quotes, then run in the Supabase SQL editor.
-- Anything left empty = the agent says "our team will confirm" instead of guessing. You can re-run this any time.

update sa_knowledge set content = 'Address: ...  |  Timings: ...  |  Phone: ...  |  Google Maps: ...' , updated_at = now() where key = 'gym_info';
update sa_knowledge set content = 'PT price: ...  |  Session length: ...  |  Trainers: ...  |  We never promise exact results.' , updated_at = now() where key = 'pt_info';
update sa_knowledge set content = 'Online coaching: ...  |  Offline coaching: ...  |  Prices: ...' , updated_at = now() where key = 'online_training';
update sa_knowledge set content = 'Only list offers that are real, with end dates. Example: Quarterly package Rs 200 off till 31 Oct.' , updated_at = now() where key = 'offers';
update sa_knowledge set content = 'Brands we sell: ...  |  Say only general benefits. Never doses. For personal guidance the owner speaks to the customer.' , updated_at = now() where key = 'supplement_policy';
update sa_knowledge set content = 'Free trial: ... (e.g. 1 free visit, bring ID)' , updated_at = now() where key = 'trial_policy';
update sa_knowledge set content = 'Facilities, trainers, achievements, story ...' , updated_at = now() where key = 'about';

-- Language used for renewal reminders to people who have never chatted with us: en | bn | bn-roman
update sa_knowledge set content = 'bn-roman' , updated_at = now() where key = 'default_language';
