1. Flujo SIP. Describe los mensajes principales de una llamada básica entre dos teléfonos, desde que
se marca hasta que se cuelga.
Respuesta:
INVITE: Este mensaje SIP se envia al servidor PBX y este al destino para iniciar una llamada.
180 Ringing: Este mensaje se envia desde el destinatario al origen indicandole que esta timbrando
200 OK: Este mensaje le envia el destinatario cuando esta listo para establecer una llamada
ACK: Este mensaje le envia el origen confirmando que recibio el OK y listo para establecer la llamada
BYE: Este mensaje se envia cuando alguno de los dos quiere terminar la llamada, es relativo al que termine.
200 OK: Este se envia como mensaje de confirmacion indicando que la llamada termino con exito.


2. SIP y RTP. ¿Qué transporta cada uno? Si un agente oye al cliente pero el cliente no lo oye a él, ¿qué
revisarías primero?
Respuesta:
El SIP transporta mensajes de pedido/aceptacion/confirmacion desde el origen a destino, pero este no lleva audio, mientras el protocolo RTP transporta el audio capturado y los empaqueta enviandolos a traves del protocolo UDP.

Si un agente oye al cliente pero el cliente no lo oye a él, ¿qué
revisarías primero?
Revisaria el firewall del agente, que no tenga los puertos UDP de salida bloqueados para la comunicacion. Si no es eso revisaria lo que seria la direccion IP del agente, validando que no sea privada y por ultimo ya seria temas de software/hardware validando que microfono este conectado correctamente, y que el sistema operativo este bien.

3. WebRTC. ¿Qué necesita un webphone en el navegador para hacer llamadas? ¿Por qué suele fallar
si la página no está en HTTPS?
Respuesta:
El webphone necesita unas funciones que el navegador proporciona, y estas son getUserMedia() que es para solicitar y capturar el audio del usuario. RTCPeerConnection() este es para gestionar tanto la salida y entrada del audio del webphone. Un canal de Señalización, un websocket seguro donde se puedan transmitir los mensajes SIP hacia el servidor PBX.

Suele fallar porque en el protocolo HTTPS implementa una regla de seguridad llamada Secure Context, y bajo esta regla es permitido el acceso al hardware y comunicaciones en tiempo real, ahora si no esta en HTTP, automaticamente se bloquean el acceso a conexiones/captura de hardware y establecimiento de comunicaciones en tiempo real.

4. Métricas. Explica con tus palabras qué son ASA, AHT y tasa de abandono.
Respuesta:
El ASA es la tiempo que permanece un cliente en la cola de espera, el AHT es el tiempo que se demora un agente atentiendo la llamada + el tiempo que lo deja esperando (SI PASA) +  la toma de notas (WRAP_UP) y la tasa de abandono es la tasa que representa que % de clientes han abandonado la llamada por estar tanto tiempo en la cola de espera.

5. Diagnóstico. Un agente aparece como Disponible en el tablero, pero no le entran llamadas
mientras la cola tiene clientes esperando. Lista tres hipótesis y cómo verificarías cada una.
Respuesta:

1. Descartar que sea el Front-end
Validar por DB los datos, que realmente el agente este en disponible, y que hayan llamadas en cola, esto para descartar una desincronizacion entre el back-end y el front-end
2. Validar en los canales de PBX
Validar en los canales de PBX el canal con extension en el agente para validar si hay un canal activo y revisar en los logs de senalizacion si realmente la sesion cerro con un BYE.
3. Validar el motor de asignacion de llamadas
Validar el motor en el codigo, debuggear porque no se estarian asignando las llamadas que estan en la cola hacia los agentes disponibles
