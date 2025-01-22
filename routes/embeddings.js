export const embeddingsHandler = async (request, env) => {
	let model = 'BAAI/bge-base-en-v1.5';
	let error = null;

	try {
		if (request.headers.get('Content-Type') === 'application/json') {
			const json = await request.json();
			if (json?.model) {
				model = json.model;
			}

			//request to hugging face api
			const url = `https://api-inference.huggingface.co/models/${model}`;
			const headers = {
				"authorization": "Bearer " + env.HUGGING_FACE_ACCESS_TOKEN,
    			"content-type": "application/json",
			};

			const response = await fetch(url, { headers, "method": "POST", body: JSON.stringify({
				input: json.input,
			}) });

			if (!response.ok) {
				throw new Error(`Failed to fetch models: ${response.statusText}`);
			}
			const responseJson = await response.json();

			return Response.json({
				object: 'list',
				data: [
					{
						object: 'embedding',
						embedding: responseJson[0],
						index: 0,
					},
				],
				model,
				usage: {
					prompt_tokens: 0,
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
