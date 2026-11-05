import { RouterProvider } from 'react-router';
import { router } from './routes';
import ServerWakeNotice from './components/ServerWakeNotice';

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ServerWakeNotice />
    </>
  );
}