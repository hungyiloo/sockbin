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
                'content': "",
                'mode': "markdown",
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
        def update(update_data):
            channels[self.channel]['content'] = update_data['content']
            self.send_out('update', update_data['content'])
            self.send_out('setCursor', update_data['position'])
        def load():
            self.send_back('update', channels[self.channel]['content'])
            self.send_back('setMode', channels[self.channel]['mode'])
            self.send_all('setUserCount', len(channels[self.channel]['listeners']))
        def set_mode(mode):
            channels[self.channel]['mode'] = mode
            self.send_out('setMode', mode)

        data = json.loads(data)
        if 'payload' in data:
            locals()[data['command']](data['payload'])
        else:
            locals()[data['command']]()

application = tornado.web.Application([
    (r"/([0-9a-zA-Z]+)", SockBinWebSocket),
])

if __name__ == "__main__":
    application.listen(30000)
    tornado.ioloop.IOLoop.instance().start()