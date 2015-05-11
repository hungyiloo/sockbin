import tornado.ioloop
import tornado.web
import tornado.websocket
import json

channels = dict()

class SockBinWebSocket(tornado.websocket.WebSocketHandler):
    def open(self, channel):
        self.channel = channel
        if channel not in channels:
            channels[channel] = {
                'listeners': [],
                'content': [""],
                'mode': "htmlmixed",
            }
        channels[self.channel]['listeners'].append(self)

    def on_close(self):
        channels[self.channel]['listeners'].remove(self)
        if len(channels[self.channel]['listeners']) == 0:
            del channels[self.channel]
        else:
            self.send_all('setUserCount', len(channels[self.channel]['listeners']))

    def send_back(self, command, payload):
        self.write_message(json.dumps({
            'command': command,
            'payload': payload    
        }))

    def send_out(self, command, payload):
        for listener in channels[self.channel]['listeners']:
            if listener != self:
                listener.send_back(command, payload)

    def send_all(self, command, payload):
        for listener in channels[self.channel]['listeners']:
            listener.send_back(command, payload)

    def on_message(self, data):
        def update(change_obj):
            channel_content = channels[self.channel]['content']

            # Merge the update into the server instance of the channel's content
            if len(channel_content) > 0:
                # Extract some positioning data and the edited text
                new_lines = change_obj['text']
                start_char = int(change_obj['from']['ch'])
                start_line = int(change_obj['from']['line'])
                end_char = int(change_obj['to']['ch'])
                end_line = int(change_obj['to']['line'])

                # For every new line, check whether it's the start line or end line of the changeset,
                # and in each case, tack on the remaining (old) portion of that line in the right place
                # then use that line as the "new" one in the result
                revised_content = []
                new_line_idx = 0
                for new_line in new_lines:
                    if new_line_idx == 0:
                        # first line merge, make sure to add leading chars
                        new_line = (channel_content[start_line][:start_char] if len(channel_content[start_line]) > 0 and start_char <= len(channel_content[start_line]) else "") + new_line
                    if new_line_idx == len(new_lines) - 1:
                        # last line merge, make sure to add trailing chars
                        new_line = new_line + (channel_content[end_line][end_char:] if len(channel_content[end_line]) > 0 and end_char < len(channel_content[end_line]) else "")
                    revised_content.append(new_line)
                    new_line_idx += 1

                # Here we look to see if there was any content outside the edit boundary.
                # If there was, we need to tack it onto the beginning and end where appropriate.
                channels[self.channel]['content'] = channel_content[:start_line] + revised_content + (channel_content[end_line+1:] if end_line + 1 <= len(channel_content) else [])
            else:
                channels[self.channel]['content'] = change_obj['text']

            # Broadcast the update to the other listeners
            self.send_out('update', change_obj)
            self.send_out('setCursor', int(change_obj['from']['line']))
        def load():
            self.send_back('update', {
                'from': { 'ch': 0, 'line': 0 },
                'to': { 'ch': 0, 'line': 0 },
                'text': channels[self.channel]['content']
            })
            self.send_back('setMode', channels[self.channel]['mode'])
            self.send_all('setUserCount', len(channels[self.channel]['listeners']))
        def set_mode(mode):
            channels[self.channel]['mode'] = mode
            self.send_out('setMode', mode)
        def chat(message):
            self.send_out('renderChat', message)


        data = json.loads(data)
        if 'payload' in data:
            locals()[data['command']](data['payload'])
        else:
            locals()[data['command']]()

application = tornado.web.Application([
    (r"/([0-9a-zA-Z]+)", SockBinWebSocket),
], ssl_options = {
    "certfile": "/home/xacro/security/ssl.crt",
    "keyfile": "/home/xacro/security/ssl.key"
})

if __name__ == "__main__":
    application.listen(10001, address='127.0.0.1')
    tornado.ioloop.IOLoop.instance().start()
