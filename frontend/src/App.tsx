import Navigation from './components/Navigation';
import Hero from './components/Hero';
import Demo from './components/Demo';
import Dashboard from './components/Dashboard';
import Architecture from './components/Architecture';
import UseCases from './components/UseCases';
import Team from './components/Team';
import Footer from './components/Footer';

function App() {
  return (
    <div className="min-h-screen bg-black">
      <Navigation />
      <Hero />
      <Demo />
      <Dashboard />
      <Architecture />
      <UseCases />
      <Team />
      <Footer />
    </div>
  );
}

export default App;
