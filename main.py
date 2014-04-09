import tornado.ioloop
import tornado.web
import tornado.websocket

app = dict()

class EchoWebSocket(tornado.websocket.WebSocketHandler):
    def open(self, channel):
    	self.channel = channel
    	if channel not in app:
    		app[channel] = {
    			'listeners': [],
    			'data': ""
    		}
    	app[self.channel]['listeners'].append(self)
    	self.write_message(app[self.channel]['data'])
    def on_message(self, message):
    	if message != "@@~~3939~~@@":
        	app[self.channel]['data'] = message
        for listener in app[self.channel]['listeners']:
        	if listener != self or message == "@@~~3939~~@@":
        		listener.write_message(app[self.channel]['data'])
    def on_close(self):
        app[self.channel]['listeners'].remove(self)
        if len(app[self.channel]['listeners']) == 0:
        	del app[self.channel]

application = tornado.web.Application([
    (r"/([0-9a-zA-Z]+)", EchoWebSocket),
])

if __name__ == "__main__":
    application.listen(30000)
    tornado.ioloop.IOLoop.instance().start()