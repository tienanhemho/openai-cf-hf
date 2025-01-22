export const completionHandler = async (request, env) => {
	let model = 'meta-llama/Llama-3.1-8B-Instruct';

	const created = Math.floor(Date.now() / 1000);
	const uuid = crypto.randomUUID();
	let error = null;

	try {
		// If the POST data is JSON then attach it to our response.
		if (request.headers.get('Content-Type') === 'application/json') {
			let json = await request.json();
			// when there is more than one model available, enable the user to select one
			if (json?.model) {
				const mapper = env.MODEL_MAPPER ?? {};
				model = mapper[json.model] ? mapper[json.model] : json.model;
			}
			if (json?.prompt) {
				if (typeof json.prompt === 'string') {
					if (json.prompt.length === 0) {
						return Response.json({ error: 'no prompt provided' }, { status: 400 });
					}
				}
			}

			//request to hugging face api
			const url = `https://api-inference.huggingface.co/models/${model}`;
			const headers = {
				"authorization": "Bearer " + env.HUGGING_FACE_ACCESS_TOKEN,
    			"content-type": "application/json",
			};

			const response = await fetch(url, { headers, "method": "POST", body: JSON.stringify({
				input: json.prompt,
				parameters: {
					max_new_tokens: json.parameters && json.parameters.max_new_tokens ? json.parameters.max_new_tokens : 100
				}
			}) });

			if (!response.ok) {
				throw new Error(`Failed to fetch models: ${response.statusText}`);
			}
			const responseJson = await response.json();

			return Response.json({
				id: uuid,
				model,
				created,
				object: 'text_completion',
				choices: [
					{
						index: 0,
						finish_reason: 'stop',
						text: responseJson[0].generated_text,
						logprobs: null,
					},
				],
				usage: {
					prompt_tokens: 0,
					completion_tokens: 0,
					total_tokens: 0,
				},
			});
		}
	} catch (e) {
		error = e;
	}

	// if there is no header or it's not json, return an error
	if (error) {
		return Response.json({ error: error.message }, { status: 400 });
	}

	// if we get here, return a 400 error
	return Response.json({ error: 'invalid request' }, { status: 400 });
};
