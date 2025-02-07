export const chatHandler = async (request, env) => {
	let model = 'meta-llama/Llama-3.1-8B-Instruct';
	let messages = [];
	let error = null;

	// get the current time in epoch seconds
	const created = Math.floor(Date.now() / 1000);
	const uuid = crypto.randomUUID();

	const idcall = "call_" + crypto.randomUUID();
	let argumentString = '';
	let contentString = '';
	let newChunk = null;
	let isToolCall = false;

	try {
		// If the POST data is JSON then attach it to our response.
		if (request.headers.get('Content-Type') === 'application/json') {
			let json = await request.json();
			// console.log("q2" + JSON.stringify(json));
			// when there is more than one model available, enable the user to select one
			if (json?.model) {
				const mapper = env.MODEL_MAPPER ?? {};
				model = mapper[json.model] ? mapper[json.model] : json.model;
			}
			if (json?.messages) {
				if (Array.isArray(json.messages)) {
					if (json.messages.length === 0) {
						return Response.json({ error: 'no messages provided' }, { status: 400 });
					}
					messages = json.messages;
				}
			}
			if (!json?.stream) json.stream = false;

			let buffer = '';

			const isValidJSON = (str) => {
				try {
					JSON.parse(str);
					return true;
				} catch (e) {
					return false;
				}
			}
			const decoder = new TextDecoder();
			const encoder = new TextEncoder();
			const transformer = new TransformStream({
				transform(chunk, controller) {
					buffer += decoder.decode(chunk);
					// Process buffered data and try to find the complete message
					while (true) {
						const newlineIndex = buffer.indexOf('\n');
						if (newlineIndex === -1) {
							// If no line breaks are found, it means there is no complete message, wait for the next chunk
							break;
						}

						// Extract a complete message line
						const line = buffer.slice(0, newlineIndex + 1);
						// console.log(line);
						// console.log("-----------------------------------");
						buffer = buffer.slice(newlineIndex + 1); // Update buffer

						// Process this line
						try {
							if (line.startsWith('data: ')) {
								const content = line.slice('data: '.length);
								// console.log("qq: " + content);
								const doneflag = content.trim() == '[DONE]';
								if (doneflag) {
									console.log("argumentString: " + argumentString);
									console.log("contentString: " + contentString);
									// controller.enqueue(encoder.encode(newChunk));
									controller.enqueue(encoder.encode("data: [DONE]\n\n"));
									return;
								}

								const data = JSON.parse(content);
								if (data.error) {
									console.log(data.error);
									throw new Error(JSON.stringify(data.error));
								}
								let delta = {
								};
								if (data.choices[0].delta.content) {
									delta.content = data.choices[0].delta.content;
									contentString += data.choices[0].delta.content;
								}
								if (data.choices[0].delta.role) {
									delta.role = data.choices[0].delta.role;
								}
								if (data.choices[0].delta.tool_calls) {
									delta.tool_calls = [ data.choices[0].delta.tool_calls ];
									if (delta.tool_calls[0].function.name === null) delete delta.tool_calls[0].function.name;
									argumentString += delta.tool_calls[0].function.arguments;
									delta.tool_calls[0].function.arguments = '';
									if (isValidJSON(argumentString)) {
										delta.tool_calls[0].function.name = JSON.parse(argumentString).function._name;
										delta.tool_calls[0].function.arguments = JSON.stringify(JSON.parse(argumentString).function);
									}
									
									if (!isToolCall) delta.tool_calls[0].id = idcall;
									else delete delta.tool_calls[0].id;
									isToolCall = true;
								}
								newChunk = {
										id: uuid,
										created: data.created,
										object: 'chat.completion.chunk',
										model: data.model,
										system_fingerprint: data.system_fingerprint,
										choices: [
											{
												delta: delta,
												index: data.choices[0].index,
												logprobs: data.choices[0].logprobs,
												finish_reason: data.choices[0].finish_reason,
											},
										],
										usage: data.usage,
								};
								controller.enqueue(encoder.encode('data: ' + JSON.stringify(newChunk) + '\n\n'));
							}
						} catch (err) {
							console.error('Error parsing line:', err);
						}
					}
				},
			});

			//request to hugging face api
			const url = `https://api-inference.huggingface.co/v1/chat/completions`;
			const headers = {
				"authorization": "Bearer " + env.HUGGING_FACE_ACCESS_TOKEN,
    			"content-type": "application/json",
			};

			// process messages
			messages = messages.map((message) => {
				if (message.content === null) message.content = '';
				return message;
			});
			let body = {
				max_tokens: json.max_tokens ?? 2048,
				stream: json.stream,
				temperature: Number(Number(json.temperature ?? 0.5).toFixed(1)),
				top_p: json.top_p ?  (json.top_p >= 1 ? 0.9 : (json.top_p <= 0 ? 0.1 : json.top_p)) : 0.7,
				messages,
				model: model,
			};
			if (messages[messages.length - 1].role === 'tool') {	
				body.tool_choice = 'none';
				if (model.match(/^meta-llama\//)) {
					messages[messages.length - 1].role = 'ipython';
				}
			}
			if (json.frequency_penalty) body.frequency_penalty = json.frequency_penalty;
			if (json.presence_penalty) body.presence_penalty = json.presence_penalty;
			if (json.tools) body.tools = json.tools;
			if (json.stream_options) body.stream_options = json.stream_options;
			console.log("q2" + JSON.stringify(body));

			const response = await fetch(url, { headers, "method": "POST", body: JSON.stringify(body) });

			if (!response.ok) {
				throw new Error(`Failed to fetch chat completion: ${response.statusText}`);
			}
			
			if (json.stream) {
				const body = response?.body;
				if (!body) {
					throw new Error(`Doesn't have body: ${response.statusText}`);
				}
				return new Response(body.pipeThrough(transformer), {
					headers: {
						'content-type': 'text/event-stream',
						'Cache-Control': 'no-cache',
						'Connection': 'keep-alive',
					},
				})
			}

			let responseJson = await response.json();
			if (responseJson.choices[0].message.tool_calls) {
				responseJson.choices[0].message.tool_calls = responseJson.choices[0].message.tool_calls.map(tool_call => {

					return {
						...tool_call,
						function: {
							...tool_call.function,
							arguments: JSON.stringify(tool_call.function.arguments),
						}
					}
				})
			}
			return Response.json(responseJson);
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
